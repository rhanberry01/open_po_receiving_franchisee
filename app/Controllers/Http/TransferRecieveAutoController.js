'use strict'
const TransferReceiveMod    = use('App/Models/TransferReceiveAuto')
const PosMod      = use('App/Models/Pos')
const CustomException = use('App/Exceptions/CustomException')
const Env = use('Env')
const Redis = use('Redis')
const Helpers = use('Helpers')
const fs = require('fs')
const PDFDocument = require('pdfkit');
const moment = require('moment')
const _ = require('lodash')
const leftPad = require('left-pad')

const TO_DATE = Env.get('TO_DATE')
const BRANCH_CODE = Env.get('BRANCH_CODE')

class TransferReceiveController {

    async fetch_receive_transfer({ request, response }) {
        let { p_page, p_transfer_no } = request.only(['p_page', 'p_transfer_no'])
        let [ list_receive_transfers, page_count ] = await TransferReceiveMod.fetch_receive_transfer(p_page, p_transfer_no)

        response.status(200).send({ list_receive_transfers, page_count })
    }

    async fetch_receive_transfer_details({ request, response }) {
        let { p_transfer_no } = request.only(['p_transfer_no'])

        let transfer = await TransferReceiveMod.fetch_receive_transfer_details(p_transfer_no)

        response.status(200).send({ transfer })
    }

    async fetch_receive_transfer_details_temp({ request, response }) {
        let { p_transfer_no } = request.only(['p_transfer_no'])

        let list_receive_transfer_details_temp = await TransferReceiveMod.fetch_receive_transfer_details_temp(p_transfer_no)

        response.status(200).send({ list_receive_transfer_details_temp })
    }


    async fetch_barcode({ request, response }) {
        let { p_barcode, p_qty, p_transfer_no } = request.post(['p_barcode', 'p_qty', 'p_transfer_no'])
        let user_id  = await Redis.get(request.user_id)

        if (p_barcode == null) {
            throw new CustomException({ message: `BARCODE IS REQUIRED` }, 401)
        }

        if (p_qty == null || p_qty < 0) {
            throw new CustomException({ message: `QTY IS REQUIRED OR INPUT VALID QTY` }, 401)
        }

        let transfer = await TransferReceiveMod.fetch_transfer_header(p_transfer_no)
        if (transfer == 0) {
            throw new CustomException({ message: `INVALID TRANSFER # FOR THIS BRANCH` }, 401)
        }

        if(transfer.aria_trans_no_out != 0 && transfer.aria_type_out != 0 && transfer.aria_trans_no_in != 0 && transfer.aria_type_in != 0) {
            throw new CustomException({ message: `TRANSFER WAS ALREADY DONE !!` }, 401)
        }

        let check_receive = await TransferReceiveMod.fetch_receive_header(p_transfer_no)
        let temp_id        = ""
        if (check_receive != 0) {
            temp_id = check_receive.id

            if (check_receive.user_id != user_id) {
                throw new CustomException({ message: await PosMod.fetch_name(check_receive.user_id) + ` IS PROCESSING THIS TRANSFER !!!` }, 401)
            }
        }

        let where_pos    = { barcode: p_barcode }
        let field_pos    = 'description, uom, productid, qty, pricemodecode, barcode, srp'
        let pos_products = await PosMod.fetch_pos_product(where_pos, field_pos)

        if (pos_products.length == 0) {
            throw new CustomException({ message: `Opss Barcode(${p_barcode}) does not exist` }, 401)
        }

        if (pos_products == -1) {
            throw new CustomException({ message: `Opss BARCODE (${p_barcode}) is assigned to 2 or more Product ID` }, 401)
        }

        

        let productid    = pos_products[0].productid
        let product      = await PosMod.fetch_products(null, productid)
        let current_inv  = product.sellingarea - product.damaged

        let checkProductId = await TransferReceiveMod.checkProductId(productid, p_transfer_no,p_barcode)
        if(!checkProductId) {
            await TransferReceiveMod.updateProductIdTransfer(p_transfer_no, productid, p_barcode, pos_products[0].uom,)
        }

        let checkProductIds = await TransferReceiveMod.checkProductId(productid, p_transfer_no,p_barcode)
        if(!checkProductIds) {
            throw new CustomException({ message: `Opps Item not in transfer` }, 401)
        }

        if(checkProductIds.uom != pos_products[0].uom) {
            throw new CustomException({ message: `UOM MISMATCH ${checkProductIds.uom} !=  ${pos_products[0].uom}` }, 401)
        }

        let qty_receive_receive = await TransferReceiveMod.qty_receive(productid, p_transfer_no, p_qty)
        let qty_receive_item    = await TransferReceiveMod.qty_receive_item(p_transfer_no, productid)

        if (qty_receive_receive > qty_receive_item) {
            throw new CustomException({ message: `Receive quantity greater than transfer quantity <br> Total Dispatch QTY: ${qty_receive_receive} | QTY for transfer: ${qty_receive_item}` }, 401)
        }

        let location_from = transfer.br_code_out
        await TransferReceiveMod.add_receive_transfer(pos_products, p_barcode, p_qty, location_from, p_transfer_no, user_id, current_inv, temp_id)

        response.status(200).send()
    }

    async fetch_temporary_items({request, response}) {
        let { p_transfer_no } = request.only(['p_transfer_no'])

        let transfer = await TransferReceiveMod.fetch_receive_header(p_transfer_no)

        let temp_id  = ''
        let user_id  = await Redis.get(request.user_id)

        if (transfer != "") {
            temp_id   = transfer.id
        }

        let total_qty_receive = await TransferReceiveMod.sum_receive_total_qty_receive(temp_id)
        let total_qty_ordered = await TransferReceiveMod.sum_total_qty_receive(p_transfer_no)

        let total_sku         = 0
        let temporary_items   = []
        if (temp_id != "") {
            temporary_items  = await TransferReceiveMod.fetch_temporary_items_receive(temp_id)
            total_sku        = await TransferReceiveMod.count_total_sku_receive(temp_id)
        }


        let total_all_sku    = await TransferReceiveMod.count_total_all_sku_receive(temp_id)
        let total_qty_scanned = await TransferReceiveMod.sum_total_qty_scanned_receive(temp_id)

        let receive_items_list   = await TransferReceiveMod.fetch_transfer_items_receive(p_transfer_no)

        let receive_items = []
        let qty_receive = 0

        for(const row of receive_items_list) {

           let items = _.find(JSON.parse(JSON.stringify(temporary_items)), { prod_id: row.stock_id_2})
           if(items == undefined) {
                qty_receive = 0
           } else {
                qty_receive = items.qty
           }

           receive_items.push({
               transfer_id: row.transfer_id,
               description: row.description,
               actual_qty_out: row.actual_qty_out,
               qty_scanned: qty_receive,
               uom: row.uom,
               stock_id: row.stock_id_2
           })
        }
        let last_item_scanned = await TransferReceiveMod.fetch_last_item_scanned(temp_id)
        last_item_scanned = _.find(receive_items, { stock_id: last_item_scanned.prod_id })
        if(last_item_scanned != undefined) {
            last_item_scanned.remaining = parseFloat(last_item_scanned.actual_qty_out) - parseFloat(last_item_scanned.qty_scanned)
            last_item_scanned = [last_item_scanned]
        } else {
            last_item_scanned = []
        }

        response.status(200).send({
            temporary_items,
            total_qty_scanned,
            receive_items,
            total_sku,
            total_qty_receive,
            total_qty_ordered,
            total_all_sku,
            last_item_scanned
        })
    }

    async delete_items({request, response}) {
        let { p_temp_id, p_transfer_no, p_id } = request.post(['p_temp_id', 'p_transfer_no', 'p_id'])
        let count_items = await  TransferReceiveMod.counts_items(p_temp_id, p_transfer_no)

        if (count_items == 1) {
            await TransferReceiveMod.delete_header_items(p_temp_id, p_transfer_no)
        }

        await TransferReceiveMod.delete_items(p_id)
        response.status(200).send({ count_items })
    }
   
    
    async post_receiving({ request, response }) {

        // let user_id  = await Redis.get(request.user_id)


        let { p_remarks, p_transfer_no, user_id } = request.only(['p_remarks', 'p_transfer_no', 'user_id'])

        
        if (p_remarks == null) {
            p_remarks = ''
        }

        let transfer = await TransferReceiveMod.fetch_receive_header(p_transfer_no)
       
        if(transfer === 0) {
            console.log('THIS IS ALREADY POSTED')
            throw new CustomException({ message: 'THIS IS ALREADY POSTED' }, 401)
        }

        let header = await TransferReceiveMod.fetch_transfer_header(p_transfer_no)
        if(header.aria_trans_no_out != 0 && header.aria_type_out != 0 && header.aria_trans_no_in != 0 && header.aria_type_in != 0) {
            console.log('TRANSFER WAS ALREADY DONE !!')
            throw new CustomException({ message: `TRANSFER WAS ALREADY DONE !!` }, 401)
        }

        let temp_id  = transfer.id

        let product_id_list = await TransferReceiveMod.fetch_receive_product_id(temp_id)
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
           await TransferReceiveMod.post_receiving(temp_id, user_id, p_remarks, p_transfer_no)
        } else {
           await TransferReceiveMod.post_receiving(temp_id, user_id, p_remarks, p_transfer_no, selling_area_negative)
        }
        // await this.upload_file_invoice(request, p_transfer_no, user_id)
        response.status(200).send({ })
    }

    async upload_file_invoice(request, p_transfer_no, user_id) {
        let file_name     = p_transfer_no+'~'+BRANCH_CODE
        let file_path_img = Helpers.tmpPath('./uploads')

        const invoice_attachment = request.file('file', {
            types: ['image', 'pdf'],
            size: '10mb'
        })

        if(invoice_attachment == null) {
            return true
        }
        let count_pdf = 0
        let count_img = 0

        for(const files of invoice_attachment._files) {
            let file_type     = files.type
            let file_sub_type = files.subtype
            if (file_type == "application" && file_sub_type == "pdf") {
                count_pdf++
            } else {
                count_img++
            }
        }

        if (count_pdf > 0 && count_img != 0) {
            throw new CustomException({ message: 'ISA LANG ANG MAARI MONG ILAGAY NA PDF FILE HINDI PWEDING PAG SAMAHIN ANG IMAGE AT PDF' }, 401)
        }

        if(count_img > 0) {
            // if file is jpg convert to pdf
            await invoice_attachment.moveAll(file_path_img, (file) => {
                let random_name = Math.random().toString(36).substr(2)
                return {
                    name: `${new Date().getTime()+'-'+random_name}.jpg`,
                    overwrite: true
                }
            })

            if (!invoice_attachment.movedAll()) {
                const removeFile  = Helpers.promisify(fs.unlink)
                const movedFiles  = invoice_attachment.movedList()
                await Promise.all(movedFiles.map((file) => {
                    removeFile(path.join(file._location, file.fileName))
                }))
                let error = invoice_attachment.errors()
                throw new CustomException({ message: error.message }, 401)
            }

            let page = 1
            const doc = new PDFDocument

            doc.pipe(fs.createWriteStream(Helpers.publicPath('scanned_invoice/transfers')+'/'+file_name+'.pdf'))
            for(const files of invoice_attachment._files) {
                if(page++ != 1) {
                    doc.addPage()
                }
                doc.image(file_path_img+'/'+files.fileName, {
                    fit: [500, 800],
                    align: 'center',
                });
            }
            doc.end();
        }

        if(count_pdf == 1) {
            await invoice_attachment.moveAll(Helpers.publicPath('scanned_invoice/transfers'), (file) => {
                let random_name = Math.random().toString(36).substr(2)
                return {
                    name: `${file_name}.${file.subtype}`,
                    overwrite: true
                }
            })

            if (!invoice_attachment.movedAll()) {
                const removeFile  = Helpers.promisify(fs.unlink)
                const movedFiles  = invoice_attachment.movedList()
                await Promise.all(movedFiles.map((file) => {
                    removeFile(path.join(file._location, file.fileName))
                }))
                let error = invoice_attachment.errors()
                throw new CustomException({ message: error.message }, 401)
            }
        }

        for(const files of invoice_attachment._files) {
          await PosMod.add_file_attachment(p_transfer_no, file_name, files.type, files.subtype, user_id, files.fileName)
        }
    }

    async fetch_transfer_slip({ request, response}) {
        let { p_transfer_no, p_date_from, p_date_to } = request.only(['p_transfer_no', 'p_date_from', 'p_date_to'])

        let transfer_slip = await TransferReceiveMod.fetch_transfer_slip(p_transfer_no, p_date_from, p_date_to)
        response.status(200).send({ transfer_slip })
    }

    async fetch_transfer_slip_item({ request, response}) {
        let { p_transfer_no } = request.only(['p_transfer_no'])

        let transfer_slip_header = await TransferReceiveMod.fetch_transfer_slip_header(p_transfer_no)
        let transfer_slip_item   = await TransferReceiveMod.fetch_transfer_slip_item(p_transfer_no)

        response.status(200).send({ transfer_slip_header, transfer_slip_item })
    }

    async fetch_print_slip({request, response, view}) {
        let { trans_no } = request.only(['trans_no'])
        let transfer_slip_header = await TransferReceiveMod.fetch_transfer_slip_header(trans_no)
        let transfer_slip_item   = await TransferReceiveMod.fetch_transfer_slip_item(trans_no)
        transfer_slip_header.date_created = moment(transfer_slip_header.date_created).format('MM-DD-YYYY')
        transfer_slip_header.transfer_out_date = moment(transfer_slip_header.transfer_out_date).format('MM-DD-YYYY')

        let total_qty = 0
        let total_cost = 0
        for(const row of transfer_slip_item){
            total_qty += row.actual_qty_out
            total_cost += row.cost
        }

        return view.render('print_slip', { transfer_slip_header, transfer_slip_item, trans_no, total_qty, total_cost })
    }

    async authPhpThirdParty({ response, request }){
      let HOST = Env.get('HOST', '192.168.0.217')
      let BRANCH_NAME = Env.get('BRANCH_NAME')
      let BRANCH_CODE = Env.get('BRANCH_CODE')

      let { user_id, fullname } = request.all()
      response.redirect('http://'+HOST+':8182/receiving/third_party/node_js/authentication?user_id='+user_id+'&fullname='+fullname+'&branch_name='+BRANCH_NAME+'&branch_code='+BRANCH_CODE)
    }

    async ConfirmReceive({ response, request }) {
      try {
        const user_id  = await Redis.get(request.user_id)
        const { v_confirm } = request.only(['v_confirm'])
        for(const id of v_confirm) {
          await Database.connection('transfers')
            .table('0_transfer_details')
            .where('id', id)
            .update({ confirm_item: user_id }) 
        }
      } catch (error) {
        console.log(error)
      }
      
      response.status(200).send({ })
    }
}

module.exports = TransferReceiveController
