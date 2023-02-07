'use strict'
const OpenPoMeatMod    = use('App/Models/OpenPoMeat')
const CustomException = use('App/Exceptions/CustomException')
const PosMod      = use('App/Models/Pos')
const Redis = use('Redis')
const Env = use('Env')
const Helpers = use('Helpers')

const fs = require('fs')
const PDFDocument = require('pdfkit');
const BRANCH_CODE = Env.get('BRANCH_CODE', '')
const _ = require('lodash')
class OpenPoMeatController {

    async fetch_supplier_open({ response }) {
        let list_supplier_open = await OpenPoMeatMod.fetch_supplier_open()

        response.status(200).send({ list_supplier_open })
    }

    async fetch_temporary_item({ request, response }) {
        let {  p_invoice_no, p_supplier } = request.only(['p_invoice_no', 'p_supplier'])

        let check_posted = await OpenPoMeatMod.check_open_po_header_posted(p_invoice_no, p_supplier)
        if (check_posted != 0) {
            throw new CustomException({ message: "ANG INVOICE NUMBER NA ITO AY NAGAMIT NA SA GANITONG SUPPLIER"})
        }

        let po_header            = await OpenPoMeatMod.fetch_open_po_header(p_invoice_no, p_supplier)
        let list_temporary_items = []
        let temp_id = ""
        if (po_header != 0) {
                temp_id          = po_header.id
            list_temporary_items = await OpenPoMeatMod.fetch_temporary_item(temp_id)
        }

        response.status(200).send({ list_temporary_items, temp_id })
    }

    async delete_items({request, response}) {
        let { p_temp_id,  p_id, p_supplier, p_type } = request.post(['p_temp_id', 'p_id', 'p_supplier', 'p_type'])
        let count_items = await  OpenPoMeatMod.counts_items(p_temp_id)
        if (count_items == 1 || p_type == 'cancel') {
            await OpenPoMeatMod.delete_header_items(p_temp_id, p_supplier)
        }

        let temp_id = (p_type == 'cancel') ? p_temp_id : null
        await OpenPoMeatMod.delete_items(p_id, temp_id)

        response.status(200).send({ count_items })
    }

    async fetch_list_uom({ request, response}) {

        let list_uoms = await PosMod.fetch_list_uom()
        response.status(200).send({ list_uoms })
    }
    
    async fetch_barcode({ request, response}) {
        let { p_barcode, p_vendor_code } = request.only(['p_barcode', 'p_vendor_code'])
        let barcode = p_barcode
        let pos_product = await PosMod.fetch_pos_product({ barcode }, 'barcode, productid, uom, markup')
        if (pos_product == -1) {
            throw new CustomException({ message: `Opss BARCODE (${barcode}) is assigned to 2 or more Product ID` }, 401)
        }

        if (pos_product.length == 0) {
            throw new CustomException({ message: `BARCODE DOES NOT EXIST` }, 401)
        }
        
        let product_id     = pos_product[0].productid
        let vendor_product = await PosMod.fetch_vendor_product(product_id, p_vendor_code)
        if (vendor_product == 0) {
            throw new CustomException({ message: `NO RESULT FOUND VENDOR PRODUCTS ${product_id} && ${p_vendor_code}` }, 401)
        }

        response.status(200).send({ pos_product, vendor_product })
    }

    async add_item({ request, response}) {
        let data = request.only(['p_markup', 'p_price' , 'p_qty' , 'p_uom', 'p_item_name', 'p_barcode', 'p_product_id', 'p_date_deliver', 'p_invoice_no', 'p_vendor_code'])
        
        await this.check_add_item(data)
        let vendor_code = data.p_vendor_code
        let inv_no      = data.p_invoice_no
        let user_id     = await Redis.get(request.user_id)
        let open_po = await OpenPoMeatMod.fetch_open_po_header(inv_no, vendor_code)
        let temp_id

        if (open_po == 0) {
            temp_id = await OpenPoMeatMod.add_open_po_header(data, user_id)
        } else {
            temp_id = open_po.id
        }
        
        let check_open_items = await OpenPoMeatMod.check_open_items(data, temp_id)
        if (check_open_items > 0) {
            throw new CustomException({ message: `ITEM IS ALREADY EXIST` }, 401)
        }

        await OpenPoMeatMod.add_open_po_items(data, temp_id)
        response.status(200).send({  })
    }

    async check_add_item(data) {
        if(data.p_qty < 0 || data.p_qty == null) {
            throw new CustomException({ message: `QUANTITY CANNOT BE EMPTY AND MUST BE GREATER THAN 0` }, 401)
        }

        if(data.p_barcode == null) {
            throw new CustomException({ message: `BARCODE CAN\'t BE EMPTY` }, 401)
        }

        if(data.p_price == null) {
            throw new CustomException({ message: `UNIT COST CAN\'t BE EMPTY` }, 401)
        }

        if(data.p_uom == null) {
            throw new CustomException({ message: `UOM CAN\'t BE EMPTY` }, 401)
        }

        if(data.p_item_name == null) {
            throw new CustomException({ message: `DESCRIPTION CAN\'t BE EMPTY` }, 401)
        }

        if(data.p_markup == null) {
            throw new CustomException({ message: `MARKUP CAN\'t BE EMPTY` }, 401)
        }
    }

    async post_receiving({ request, response }) {
        let user_id      = await Redis.get(request.user_id)
        let { p_inv_no, p_vendor_code, p_remarks, p_temp_id } = request.only(['p_inv_no', 'p_vendor_code', 'p_remarks', 'p_temp_id'])
       
        let po_detail = await OpenPoMeatMod.fetch_current_open_po(user_id, p_temp_id, p_vendor_code)
        if (po_detail == 0) {
            throw new CustomException({ message: `THIS WAS ALREADY POSTED ` }, 401)
        }
        
        if (p_inv_no == null) {
            throw new CustomException({ message: `Invoice no # is required` }, 401)
        }
        
        if (p_remarks == null) {
            p_remarks = ''
        }
        
        let temp_id     = po_detail.id
        let supplier_id = po_detail.vendor_code
       
        let product_id_list =  await OpenPoMeatMod.fetch_open_details_product_id(temp_id)
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
           receiving_no = await OpenPoMeatMod.post_receiving(temp_id, p_inv_no, p_remarks, p_vendor_code, user_id)
        } else {
            receiving_no = await OpenPoMeatMod.post_receiving(temp_id, p_inv_no, p_remarks, p_vendor_code, user_id, selling_area_negative)
        }
        await this.upload_file_invoice(request, temp_id, receiving_no, user_id)

        response.status(200).send({ receiving_no })
    }

    async upload_file_invoice(request, p_po, receiving_no, user_id) {
        let file_name     = BRANCH_CODE+'~OP'+p_po+'~'+receiving_no
        let file_path_img = Helpers.tmpPath('./uploads')

        const invoice_attachment = request.file('file', {
            types: ['image', 'pdf', 'png']
        })
        
        let file_type     = invoice_attachment.type
        let file_sub_type = invoice_attachment.subtype
        //if file is pdf direct upload to invoice
        if (file_type == "application" && file_sub_type == "pdf") {
            await invoice_attachment.move(Helpers.publicPath('scanned_invoice/invoice'), {
                name: file_name+'.'+file_sub_type,
                overwrite: true
            }) 

            if (!invoice_attachment.moved()) {
                let error = invoice_attachment.error()
                throw new CustomException({ message: error.message }, 401)
            }
        } else {
            // if file is jpg convert to pdf
            await invoice_attachment.move(file_path_img, {
                name: file_name+'.jpg',
                overwrite: true
            }) 

            if (!invoice_attachment.moved()) {
                let error = invoice_attachment.error()
                throw new CustomException({ message: error.message }, 401)
            }

            const doc = new PDFDocument

            doc.pipe(fs.createWriteStream(Helpers.publicPath('scanned_invoice/invoice')+'/'+file_name+'.pdf'));
            doc.image(file_path_img+'/'+file_name+'.jpg', {
                fit: [500, 800],
                align: 'center',
            });

            // Finalize PDF file
            doc.end();
        }

        await PosMod.add_file_attachment('OP'+p_po, file_name, file_type, file_sub_type, user_id)
    }
}

module.exports = OpenPoMeatController
