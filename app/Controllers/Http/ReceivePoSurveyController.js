'use strict'
const ReceivePoMod    = use('App/Models/ReceivePoSurvey')
const CustomException = use('App/Exceptions/CustomException')
const PosMod      = use('App/Models/Pos')
const Env = use('Env')
const Helpers = use('Helpers')
const Redis = use('Redis')

const fs = require('fs')
const PDFDocument = require('pdfkit');
const moment = require('moment')
const _ = require('lodash')
const leftPad = require('left-pad')
const path = require('path')
const TO_DATE = Env.get('TO_DATE')
const BRANCH_CODE = Env.get('BRANCH_CODE')

class ReceivePoSurveyController {

    async fetch_po({ request, response }) {

        let user_id  = await Redis.get(request.user_id)
        let { p_po } = request.only(['p_po'])
       
        let po                = await ReceivePoMod.fetch_po(p_po) 
        let rs_pending        = await ReceivePoMod.fetch_rs_pending(po)
        let total_qty_receive = await ReceivePoMod.sum_total_qty_receive(po)        
        let total_qty_ordered = await ReceivePoMod.sum_total_qty_ordered(po) 

        await this.check_po_status(total_qty_receive, total_qty_ordered, po)

        let temp_id   = ""
        let inv_no    = ""
        let status
        let receiving = await ReceivePoMod.fetch_receiving(p_po, user_id)
        
        if (receiving != 0) {
             temp_id = receiving.id
             inv_no = receiving.inv_no
        }

        if (user_id != receiving.user_id && receiving != 0) {
            throw new CustomException({ message: "Ang P.O na ito ay ginamit na ni " + receiving.user_id})
        }

        let to_date       =  moment().format(TO_DATE)
        let supplier_name = po.supplier_name
        let supplier_id   = po.supplier_id
        
        response.status(200).json({ 
            to_date,
            supplier_name, 
            supplier_id,
            inv_no,
            rs_pending, 
            temp_id,
        })
    }

    async check_po_status(total_qty_receive, total_qty_ordered, { status }) {
        if (total_qty_receive == total_qty_ordered) {
            throw new CustomException({ message: "Ang P.O # na ito ay na received na !!"})
        }

        if (status != 0) {
            message = "Ang P.O# na ito ay na CANCELLED na, Maaring mag inform sa purchser"
            throw new CustomException({ message }, 401)
        }

        return true
    }

    async fetch_temporary_items({request, response, session}) {
        let { p_temp_id, p_po } = request.only(['p_temp_id', 'p_po'])
        
        let po                = await ReceivePoMod.fetch_po(p_po) 

        let user_id           = await Redis.get(request.user_id)
        let order_no          = po.order_no
        let total_qty_receive = await ReceivePoMod.sum_total_qty_receive(po)        
        let total_qty_ordered = await ReceivePoMod.sum_total_qty_ordered(po) 
        let total_sku         = 0
        let temporary_items   = []
        
        if (p_temp_id != "") {
            temporary_items  = await ReceivePoMod.fetch_temporary_items(p_temp_id)
            total_sku        = await ReceivePoMod.sum_total_sku(p_po)
        }

        // let total_qty_posted  = await ReceivePoMod.sum_total_qty_posted(p_po)
        //
        let total_qty_scanned = await ReceivePoMod.sum_total_qty_scanned(p_po)

        let pending_po = await ReceivePoMod.fetch_pending_po(user_id)
        let po_items   = await ReceivePoMod.fetch_po_items(order_no)

        response.status(200).send({ 
            temporary_items,
            total_qty_scanned,
            pending_po,
            po_items,
            total_sku,
            total_qty_receive,
            total_qty_ordered,
            order_no
           
        })
    }

    async delete_items({request, response}) {
        let { p_temp_id, p_po, p_id } = request.post(['p_temp_id', 'p_po', 'p_id'])
        let count_items = await  ReceivePoMod.counts_items(p_temp_id, p_po)
        if (count_items == 1) {

            await ReceivePoMod.delete_header_items(p_temp_id, p_po)
        }

        await ReceivePoMod.delete_items(p_id)

        response.status(200).send({ count_items })
    }

    async fetch_barcode({ request, response, session}) {
        
        let { p_barcode, p_qty, p_po, p_order_no, p_temp_id, p_inv_no } = request.post(['p_barcode', 'p_qty', 'p_po', 'p_order_no', 'p_temp_id', 'p_inv_no'])

        let where_pos    = { barcode: p_barcode }
        let field_pos    = 'description, uom, productid, qty, pricemodecode, barcode, srp'
        let pos_products = await PosMod.fetch_pos_product(where_pos, field_pos)

        let user_id = await Redis.get(request.user_id)

        if (pos_products == -1) {
            throw new CustomException({ message: `Opss BARCODE (${p_barcode}) is assigned to 2 or more Product ID` }, 401)
        }

        if (pos_products.length == 0) {
            throw new CustomException({ message: `Opss Barcode(${p_barcode}) does not exist` }, 401)
        }
        
        let product_id  = pos_products[0].productid
        let description = pos_products[0].description
        let srp         = pos_products[0].srp
        let uom         = pos_products[0].uom
        let po_product  = await ReceivePoMod.check_po_product_id(p_order_no, product_id)

        let unit_id = po_product.unit_id

        if (unit_id != uom) {
            throw new CustomException({ message: `UOM mismatched ${uom} != ${unit_id} ERROR ${uom} = ${unit_id} ` }, 401)
        }

        //remove mo to sa price survey at free goods dina need to pati sa model
        // let cost_of_sales = await ReceivePoMod.CostOfSales(product_id, p_order_no)
        // if (srp <= cost_of_sales) {
        //     throw new CustomException({ message: `CostOfSales is greater than SRP` }, 401)
        // }

        let receive_qty = await ReceivePoMod.receive_qty(product_id, p_order_no, p_qty)
        let po__qty     = await ReceivePoMod.po_qty(product_id, p_order_no)

        if (po__qty < receive_qty ) {
            throw new CustomException({ message: `Received quantity greater than remaining PO quantity. Total Received  QTY ${receive_qty} | PO QTY ${po__qty}` }, 401)
        }

        if (p_temp_id == "" || p_temp_id == null) {
            p_temp_id = await ReceivePoMod.add_receiving_header(p_order_no, p_po, p_inv_no, user_id)
        }

        let check_barcode = await ReceivePoMod.check_barcode_receiving(p_barcode, product_id, p_temp_id)
        if (check_barcode == 0) {
            let unit_price = po_product.unit_price
            let product  = await PosMod.fetch_product_in([product_id])
            let inc = parseFloat(product[0].costofsales)*1.05
            let dec = parseFloat(product[0].costofsales)*9.5
            let new_uc = parseFloat(unit_price) / parseFloat(pos_products[0].qty)
            if (new_uc >= dec && new_uc <= inc) {
                await ReceivePoMod.add_receiving_details(p_temp_id, product_id, p_barcode, description, uom, p_qty, unit_price, unit_price)
            } else {
                let cost = product[0].costofsales *  parseFloat(pos_products[0].qty)
                await ReceivePoMod.add_receiving_details(p_temp_id, product_id, p_barcode, description, uom, p_qty, cost, unit_price)
            }
        } else {
            await ReceivePoMod.update_receiving_details(p_temp_id, product_id, p_barcode, p_qty)
        }

        response.status(200).send({ p_temp_id })
    }
    
    async post_receiving({request, response, session}){
        
        let user_id  = await Redis.get(request.user_id)
        let { p_inv_no, p_po, p_temp_id, p_remarks} = request.only(['p_inv_no', 'p_po', 'p_temp_id', 'p_remarks'])
       
        let po_detail = await ReceivePoMod.fetch_receiving_po(p_po, p_temp_id, user_id)
        if (po_detail == 0) {
            throw new CustomException({ message: `Invalid PO #` }, 401)
        }

        let supplier_id = po_detail.supplier_id

        let product_id_list =  await ReceivePoMod.fetch_receiving_product_id(p_temp_id)
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
        
        let receiving_no

        if (selling_area_negative.length == 0) {
            receiving_no = await ReceivePoMod.post_receiving(p_temp_id, p_inv_no, p_remarks, p_po, BRANCH_CODE, user_id)
        }else {
            receiving_no = await ReceivePoMod.post_receiving(p_temp_id, p_inv_no, p_remarks, p_po, BRANCH_CODE, user_id, selling_area_negative)
        }

        await this.upload_file_invoice(request, p_po, receiving_no, user_id)

        response.status(200).send({ receiving_no })
    }

    async upload_file_invoice(request, p_po, receiving_no, user_id) {
        let file_path_img = Helpers.tmpPath('./uploads')
        let file_name     = BRANCH_CODE+'~'+p_po.toUpperCase()+'~'+receiving_no

        const invoice_attachment = request.file('file', {
            types: ['image', 'pdf'],
            size: '10mb'
        })

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
            doc.pipe(fs.createWriteStream(Helpers.publicPath('scanned_invoice/invoice')+'/'+file_name+'.pdf'))
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
            await invoice_attachment.moveAll(Helpers.publicPath('scanned_invoice/invoice'), (file) => {
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
            await PosMod.add_file_attachment(p_po, file_name, files.type, files.subtype, user_id, files.fileName)
        }
        return true
    }

    async fetch_pending_survey({ request, response, session }) {
        let user_id    = await Redis.get(request.user_id)
        let pending_po = await ReceivePoMod.fetch_pending_po(user_id)

        response.status(200).send({ pending_po })
    }

    async fetch_survey_inquiry({ request, response}) {
        let { p_date_from, p_date_to } = request.only(['p_date_from', 'p_date_to'])
        
        let list_survey_inquiry = await ReceivePoMod.fetch_survey_inquiry( p_date_from, p_date_to)
        response.status(200).send({ list_survey_inquiry })
    }
}

module.exports = ReceivePoSurveyController
