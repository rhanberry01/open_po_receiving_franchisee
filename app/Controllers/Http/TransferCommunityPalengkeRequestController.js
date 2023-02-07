'use strict'
const TransferDispatchMod    = use('App/Models/TransferCommunityPalengkeRequest')
const PosMod      = use('App/Models/PosPalengke')
const CustomException = use('App/Exceptions/CustomException')
const Env = use('Env')
const Helpers = use('Helpers')
const Redis = use('Redis')
const fs = require('fs')
const PDFDocument = require('pdfkit');
const moment = require('moment')
const _ = require('lodash')
const leftPad = require('left-pad')
const Db = use('Database')
const TO_DATE = Env.get('TO_DATE')
const BRANCH_CODE = Env.get('BRANCH_CODE')

class TransferCommunityPalengkeRequestController {

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
        let temp_id = p_transfer_no

        const gi_check = await PosMod.check_gi()
        if (gi_check.length > 0) {
          throw new CustomException({ message: `OPPS G.I IS ONGOING PAKI ANTAY MUNA MATAPOS MAG G.I` }, 401)
        }

        if (p_barcode == null) {
            throw new CustomException({ message: `BARCODE IS REQUIRED` }, 401)
        }

        if(typeof temp_id === 'undefined') {
          temp_id = null
        }

        if (p_qty == null || p_qty < 0) {
            throw new CustomException({ message: `QTY IS REQUIRED OR INPUT VALID QTY` }, 401)
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
        
        await TransferDispatchMod.add_dispatch_transfer(pos_products, product, p_barcode, p_qty,  temp_id, user_id)
        response.status(200).send()
    }

    async fetch_temporary_items({request, response, session}) {

        const row = await Db.connection('transfers_palengke').select('id')
          .from('0_transfer_palengke_header')
          .where('status', 0)
          .orderBy('id', 'desc')
          .limit(1)

        const transfer = await Db.connection('transfers_palengke').select('id')
          .from('0_transfer_palengke_header')
          .where('status', 1)

        let pl_no = 1
        if(row.length === 1) {
          pl_no = row[0].id + 1
        }

        let temp_id = ''
        let temporary_items = []
        if(transfer.length > 0) {
          temp_id = transfer[0].id
          pl_no = transfer[0].id
          temporary_items  = await Db.connection('transfers_palengke')
            .from('0_transfer_palengke_details')
            .where('transfer_id', temp_id)
            .orderBy('id', 'ASC')
        }
        
        response.status(200).send({ 
            temporary_items,
            temp_id,
            pl_no
        })
    }

    async delete_items({request, response}) {
        let { p_temp_id, p_id } = request.post(['p_temp_id', 'p_id'])

        let count_items = await  TransferDispatchMod.counts_items(p_temp_id)

        if (count_items == 1) {
            await TransferDispatchMod.delete_header_items(p_temp_id)
        }

        await TransferDispatchMod.delete_items(p_id)
        response.status(200).send({ count_items })
    }

    async post_receiving({ request, response }) {
        
        let user_id  = await Redis.get(request.user_id)
        let {  temp_id } = request.only(['temp_id'])

        await Db.connection('transfers_palengke').table('0_transfer_palengke_header')
            .where('status', 1)
            .andWhere('id', temp_id)
            .update({ status: 0}) 

        // if (p_username === null || p_password === null) {
        //   throw new CustomException({ message: `USERNAME AND PASSWORD BRANCH MANAGER IS REQUIRED FOR POSTING` }, 401)
        // }

        // const access_posting = await TransferDispatchMod.check_access_posting(p_username, p_password)
        // if(access_posting.length === 0) {
        //   throw new CustomException({ message: `USERNAME AND PASSWORD IS INVALID` }, 401)
        // }

        // if(parseInt(access_posting[0].status) === 0) {
        //   throw new CustomException({ message: `BRANCH MANAGER IS NO LONGER ACCESS FOR POSTING` }, 401)
        // }

        // let accessId = access_posting[0].id
        // let temp_id  = p_transfer_no

        // let product_id_list =  await TransferDispatchMod.fetch_dispatch_product_id(temp_id)
        // let product_id_array= []
        // _.each(product_id_list, function (row) {
        //     product_id_array.push(row.prod_id)
        // })
        
        // let products = await PosMod.fetch_product_in(product_id_array)
        // let selling_area_negative = []

        // _.each(products, function (row) {
        //     if (row.sellingarea < 0) {
        //         selling_area_negative.push(row.productid)
        //     }
        // })

        // if (selling_area_negative.length == 0) {
        //     //enable for caravan
        //     // await TransferDispatchMod.update_dispatch_transfer(p_transfer_no)
        //     // await TransferDispatchMod.update_caravan_transfer_dispatch(p_transfer_no)
        //     // await TransferDispatchMod.update_header_transfer_caravan(p_transfer_no, user_id, p_delivered_by, p_checked_by )
        //    await TransferDispatchMod.post_receiving(temp_id, user_id, accessId)
        // } else {
        //     // await TransferDispatchMod.update_dispatch_transfer(p_transfer_no)
        //     // await TransferDispatchMod.update_caravan_transfer_dispatch(p_transfer_no)
        //     // await TransferDispatchMod.update_header_transfer_caravan(p_transfer_no, user_id, p_delivered_by, p_checked_by )
        //   //  await TransferDispatchMod.post_receiving(temp_id, user_id, p_checked_by, p_delivered_by, p_transfer_no, selling_area_negative)
        // }

        response.status(200).send({ })
    }

    async fetch_transfer_slip({ request, response}) {
      let { p_date_from, p_date_to } = request.only(['p_date_from', 'p_date_to'])

      let transfer_slip = await TransferDispatchMod.fetch_return(p_date_from, p_date_to)
      response.status(200).send({ transfer_slip })
  }

  async fetch_transfer_slip_item({ request, response}) {
    let { p_transfer_no } = request.only(['p_transfer_no'])

    let transfer_slip_header = await TransferDispatchMod.fetch_transfer_slip_header(p_transfer_no)
    let transfer_slip_item   = await TransferDispatchMod.fetch_transfer_slip_item(p_transfer_no)

    response.status(200).send({ transfer_slip_header, transfer_slip_item })
}
}

module.exports = TransferCommunityPalengkeRequestController
