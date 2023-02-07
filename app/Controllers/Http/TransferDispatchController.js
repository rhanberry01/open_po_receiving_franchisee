'use strict'
const TransferDispatchMod    = use('App/Models/TransferDispatch')
const PosMod      = use('App/Models/Pos')
const CustomException = use('App/Exceptions/CustomException')
const Env = use('Env')
const Helpers = use('Helpers')
const Redis = use('Redis')
const fs = require('fs')
const PDFDocument = require('pdfkit');
const moment = require('moment')
const _ = require('lodash')
const leftPad = require('left-pad')

const TO_DATE = Env.get('TO_DATE')
const BRANCH_CODE = Env.get('BRANCH_CODE')

class TransferDispatchController {

    async fetch_dispatch_transfer({ request, response }) {
        let { p_page, p_transfer_no } = request.only(['p_page', 'p_transfer_no'])
        let [ list_dispatch_transfers, page_count ] = await TransferDispatchMod.fetch_dispatch_transfer(p_page, p_transfer_no)
        
        response.status(200).send({ list_dispatch_transfers, page_count })
    }

    async fetch_dispatch_transfer_details({ request, response }) {
        let { p_transfer_no } = request.only(['p_transfer_no'])

        let transfer = await TransferDispatchMod.fetch_dispatch_transfer_details(p_transfer_no)

        response.status(200).send({ transfer })
    }

    async fetch_dispatch_transfer_details_temp({ request, response }) {
        let { p_transfer_no } = request.only(['p_transfer_no'])

        let list_dispatch_transfer_details_temp = await TransferDispatchMod.fetch_dispatch_transfer_details_temp(p_transfer_no)

        response.status(200).send({ list_dispatch_transfer_details_temp })
    }

    async fetch_barcode({ request, response }) {
       
        let { p_barcode, p_qty, p_transfer_no } = request.post(['p_barcode', 'p_qty', 'p_transfer_no'])
        let user_id   = await Redis.get(request.user_id)
        
        if (p_barcode == null) {
            throw new CustomException({ message: `BARCODE IS REQUIRED` }, 401)
        }

        if (p_qty == null || p_qty < 0) {
            throw new CustomException({ message: `QTY IS REQUIRED OR INPUT VALID QTY` }, 401)
        }

        let transfer = await TransferDispatchMod.fetch_transfer_header(p_transfer_no)
        if (transfer == 0) {
            throw new CustomException({ message: `INVALID TRANSFER # FOR THIS BRANCH` }, 401)
        }

        if(transfer.aria_trans_no_out != 0 && transfer.aria_type_out != 0) {
            throw new CustomException({ message: `TRANSFER WAS ALREADY DONE !!` }, 401)
        }
        let check_dispatch = await TransferDispatchMod.fetch_dispatch_header(p_transfer_no)
        
        let temp_id        = ""
        if (check_dispatch != 0) {
            temp_id = check_dispatch.id

            if (check_dispatch.user_id != user_id) {
                throw new CustomException({ message: await PosMod.fetch_name(check_dispatch.user_id) + ` IS PROCESSING THIS TRANSFER !!!` }, 401)
            }
        }

        let where_pos    = { barcode: p_barcode }
        let field_pos    = 'description, uom, productid'
        let pos_products = await PosMod.fetch_pos_product(where_pos, field_pos)
       
        if (pos_products == -1) {
            throw new CustomException({ message: `Opss BARCODE (${p_barcode}) is assigned to 2 or more Product ID` }, 401)
        }

        if (pos_products.length == 0) {
            throw new CustomException({ message: `Opss Barcode(${p_barcode}) does not exist` }, 401)
        }
        
        let productid    = pos_products[0].productid
        let product      = await PosMod.fetch_products(null, productid)
        let current_inv  = product.sellingarea - product.damaged
        
        let qty_receive_dispatch = await TransferDispatchMod.qty_dispatch(productid, p_transfer_no, p_qty)
        let qty_dispatch_item    = await TransferDispatchMod.qty_dispatch_item(p_transfer_no, productid)
        
        let checkProductId = await TransferDispatchMod.checkProductId(productid, p_transfer_no)
        if(!checkProductId) {
            await TransferDispatchMod.updateProductIdTransfer(p_transfer_no, productid, p_barcode, pos_products[0].uom)
        }

        let checkProductIds = await TransferDispatchMod.checkProductId(productid, p_transfer_no)
        if(!checkProductIds) {
            throw new CustomException({ message: `Opps Item not in transfer` }, 401)
        }

        if(product.sellingarea <= 0) {
          throw new CustomException({ message: `(${p_barcode}) is currently negative or will turn negative quantity on the system, Kindly inform PURCHASER scanning of this item.` }, 401)
        }

        if(checkProductIds.uom != pos_products[0].uom) {
          throw new CustomException({ message: `UOM MISMATCH ${checkProductIds.uom} !=  ${pos_products[0].uom}` }, 401)
        }
        
        if (qty_receive_dispatch > qty_dispatch_item) {
          throw new CustomException({ message: `Dispatch quantity greater than transfer quantity <br> Total Dispatch QTY: ${qty_receive_dispatch} | QTY for transfer: ${qty_dispatch_item}` }, 401)
        }
       
        let location_to = transfer.name
        await TransferDispatchMod.add_dispatch_transfer(pos_products, p_barcode, p_qty, location_to, p_transfer_no, user_id, current_inv, temp_id)
       
        response.status(200).send()
    }

    async fetch_temporary_items({request, response, session}) {
        let { p_transfer_no } = request.only(['p_transfer_no'])
        
        let transfer = await TransferDispatchMod.fetch_dispatch_header(p_transfer_no)

        let temp_id  = ''
        let user_id  = await Redis.get(request.user_id)
        
        if (transfer != "") {
            temp_id   = transfer.id
        }

        let total_qty_receive = await TransferDispatchMod.sum_dispatch_total_qty_receive(temp_id)       
        let total_qty_ordered = await TransferDispatchMod.sum_total_qty_dispatch(p_transfer_no)
       
        let total_sku         = 0
        let temporary_items   = []
        
        if (temp_id != "") {
            temporary_items  = await TransferDispatchMod.fetch_temporary_items_dispatch(temp_id)
            total_sku        = await TransferDispatchMod.count_total_sku_dispatch(temp_id)
        }
        
        let total_all_sku    = await TransferDispatchMod.count_total_all_sku_dispatch(temp_id)
        let total_qty_scanned = await TransferDispatchMod.sum_total_qty_scanned_dispatch(temp_id)
        
        let dispatch_items_list   = await TransferDispatchMod.fetch_transfer_items_dispatch(p_transfer_no)
        let dispatch_items = []
        let qty_receive = 0
        for(const row of dispatch_items_list) {

           let items = _.find(JSON.parse(JSON.stringify(temporary_items)), { prod_id: row.stock_id})
           if(items == undefined) {
                qty_receive = 0
           } else {
                qty_receive = items.qty
           }

           dispatch_items.push({
               barcode: row.barcode,
               transfer_id: row.transfer_id,
               description: row.description,
               qty_out: row.qty_out,
               qty_scanned: qty_receive,
               unit_id: row.uom,
               stock_id: row.stock_id_2
           })
        }
        let last_item_scanned = await TransferDispatchMod.fetch_last_item_scanned(temp_id)
        last_item_scanned = _.find(dispatch_items, { stock_id: last_item_scanned.prod_id })
        if(last_item_scanned != undefined) {
            last_item_scanned.remaining = parseFloat(last_item_scanned.qty_out) - parseFloat(last_item_scanned.qty_scanned)
            last_item_scanned = [last_item_scanned]
        } else {
            last_item_scanned = []
        }
     
        response.status(200).send({ 
            temporary_items,
            total_qty_scanned,
            dispatch_items,
            total_sku,
            total_qty_receive,
            total_qty_ordered,
            total_all_sku,
            last_item_scanned
        })
    }

    async delete_items({request, response}) {
        let { p_temp_id, p_transfer_no, p_id } = request.post(['p_temp_id', 'p_transfer_no', 'p_id'])
        let count_items = await  TransferDispatchMod.counts_items(p_temp_id, p_transfer_no)

        if (count_items == 1) {
            await TransferDispatchMod.delete_header_items(p_temp_id, p_transfer_no)
        }

        await TransferDispatchMod.delete_items(p_id)
        response.status(200).send({ count_items })
    }

    async post_receiving({ request, response }) {
        
        let user_id  = await Redis.get(request.user_id)
        let { p_checked_by, p_delivered_by, p_transfer_no } = request.only(['p_checked_by', 'p_delivered_by', 'p_transfer_no'])
        
        if (p_checked_by == null) {
            throw new CustomException({ message: `CHECKED BY IS REQUIRED` }, 401)
        }

        if (p_delivered_by == null) {
            throw new CustomException({ message: `DELIVERED BY IS REQUIRED` }, 401)
        }

        let transfer = await TransferDispatchMod.fetch_dispatch_header(p_transfer_no)
        
        let temp_id  = transfer.id

        let product_id_list =  await TransferDispatchMod.fetch_dispatch_product_id(temp_id)
        let product_id_array= []

        _.each(product_id_list, function (row) {
            product_id_array.push(row.prod_id)
        })
        
        let products = await PosMod.fetch_product_in(product_id_array)
        let selling_area_negative = []

        _.each(products, function (row) {
            if (row.sellingarea < 0) {
                selling_area_negative.push(row.productid)
            }
        })

        if (selling_area_negative.length == 0) {
            //enable for caravan
            // await TransferDispatchMod.update_dispatch_transfer(p_transfer_no)
            // await TransferDispatchMod.update_caravan_transfer_dispatch(p_transfer_no)
            // await TransferDispatchMod.update_header_transfer_caravan(p_transfer_no, user_id, p_delivered_by, p_checked_by )
           await TransferDispatchMod.post_receiving(temp_id, user_id, p_checked_by, p_delivered_by, p_transfer_no)
        } else {
            // await TransferDispatchMod.update_dispatch_transfer(p_transfer_no)
            // await TransferDispatchMod.update_caravan_transfer_dispatch(p_transfer_no)
            // await TransferDispatchMod.update_header_transfer_caravan(p_transfer_no, user_id, p_delivered_by, p_checked_by )
           await TransferDispatchMod.post_receiving(temp_id, user_id, p_checked_by, p_delivered_by, p_transfer_no, selling_area_negative)
        }

        response.status(200).send({ })
    }

    async update_qty({ request, response }) {
      const data = request.all()
      const qtyDispatch = await TransferDispatchMod.qty_dispatch_item_v1(data.transfer_id, data.prod_id, data.barcode)
      if(parseFloat(data.qty) > qtyDispatch) {
        throw new CustomException({ message: `Dispatch quantity greater than transfer quantity <br> Total Dispatch QTY: ${parseFloat(data.qty)} | QTY for transfer: ${qtyDispatch}` }, 401)
      }
      const res = await TransferDispatchMod.update_qty(data.id, data.qty)
      response.status(200).send({ res })
    }
}

module.exports = TransferDispatchController
