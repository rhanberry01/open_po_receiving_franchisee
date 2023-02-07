'use strict'
const OpenPoVariableMod    = use('App/Models/OpenPoVariable')
const CustomException = use('App/Exceptions/CustomException')
const PosMod      = use('App/Models/Pos')
const Redis = use('Redis')
const Env = use('Env')
const Helpers = use('Helpers')

const fs = require('fs')
const PDFDocument = require('pdfkit');
const BRANCH_CODE = Env.get('BRANCH_CODE', '')
const _ = require('lodash')
class OpenPoVariableController {

    async fetch_supplier_open({ response }) {
      try {
        let list_supplier_open = await OpenPoVariableMod.fetch_supplier_open()
        response.status(200).send({ list_supplier_open })
      } catch(ee) {
        console.log(ee)
      }
        
    }

    async fetch_temporary_item({ request, response }) {
        let {  p_invoice_no, p_supplier } = request.only(['p_invoice_no', 'p_supplier'])

        let check_posted = await OpenPoVariableMod.check_open_po_header_posted(p_invoice_no, p_supplier)
        if (check_posted != 0) {
            throw new CustomException({ message: "ANG INVOICE NUMBER NA ITO AY NAGAMIT NA SA GANITONG SUPPLIER"})
        }

        let po_header            = await OpenPoVariableMod.fetch_open_po_header(p_invoice_no, p_supplier)
        let list_temporary_items = []
        let temp_id = ""
        if (po_header != 0) {
                temp_id          = po_header.id
            list_temporary_items = await OpenPoVariableMod.fetch_temporary_item(temp_id)
        }

        response.status(200).send({ list_temporary_items, temp_id })
    }

    async delete_items({request, response}) {
        let { p_temp_id,  p_id, p_supplier, p_type } = request.post(['p_temp_id', 'p_id', 'p_supplier', 'p_type'])
        let count_items = await  OpenPoVariableMod.counts_items(p_temp_id)
        if (count_items == 1 || p_type == 'cancel') {
            await OpenPoVariableMod.delete_header_items(p_temp_id, p_supplier)
        }

        let temp_id = (p_type == 'cancel') ? p_temp_id : null
        await OpenPoVariableMod.delete_items(p_id, temp_id)

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
        let open_po = await OpenPoVariableMod.fetch_open_po_header(inv_no, vendor_code)
        let temp_id

        if (open_po == 0) {
            temp_id = await OpenPoVariableMod.add_open_po_header(data, user_id)
        } else {
            temp_id = open_po.id
        }
        
        let check_open_items = await OpenPoVariableMod.check_open_items(data, temp_id)
        if (check_open_items > 0) {
            throw new CustomException({ message: `ITEM IS ALREADY EXIST` }, 401)
        }

        await OpenPoVariableMod.add_open_po_items(data, temp_id)
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
       
        let po_detail = await OpenPoVariableMod.fetch_current_open_po(user_id, p_temp_id, p_vendor_code)
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
       
        let product_id_list =  await OpenPoVariableMod.fetch_open_details_product_id(temp_id)
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
           receiving_no = await OpenPoVariableMod.post_receiving(temp_id, p_inv_no, p_remarks, p_vendor_code, user_id)
        } else {
            receiving_no = await OpenPoVariableMod.post_receiving(temp_id, p_inv_no, p_remarks, p_vendor_code, user_id, selling_area_negative)
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

    async fetch_open_inquiry({ request, response}) {
        let { p_rr_no, p_date_from, p_date_to } = request.only(['p_rr_no', 'p_date_from', 'p_date_to'])
        
        let open_row = await OpenPoVariableMod.fetch_open_inquiry(p_rr_no, p_date_from, p_date_to)
        let list_open_po = []

        for (const row of open_row) {
            let open_id = "OP"+row.id
            let receive = await OpenPoVariableMod.fetch_receiving(open_id)

            list_open_po.push({
                date_ : row.date_,
                open_id: open_id,
                inv_no: row.inv_no,
                receiving_no: (!receive.receivingno) ? "" : receive.receivingno,
                supplier_name: row.supplier_name,
                user_id: row.user_id,
                net_total: (!receive.nettotal) ? 0 : receive.nettotal,
                posted: (row.posted == 1) ? "POSTED" : "OPEN"
            })
        }

        response.status(200).send({ list_open_po })
    }

    async fetch_price_change({ request, response }) {
        let { p_date_from, p_date_to } = request.only(['p_date_from', 'p_date_to'])
        
        let list_price_changes_array = await OpenPoVariableMod.fetch_price_change(p_date_from, p_date_to)
        let list_price_changes = []

        for(const row of list_price_changes_array) {
            let ms_row      = await PosMod.fetch_pos_product({ barcode: row.barcode }, 'description')
            let description = ms_row[0].description

            list_price_changes.push({
                dateposted: row.dateposted,
                productid: row.productid,
                barcode: row.barcode,
                description: description,
                uom: row.uom,
                markup: row.markup.toFixed(4),
                fromsrp: row.fromsrp,
                tosrp: row.tosrp,
            })
        }
        response.status(200).send({ list_price_changes })
    }


    async weighingScaleReport({ request, response}) {
      let { update_scale, v_code } = request.only(['update_scale', 'v_code'])
      const user_id     = await Redis.get(request.user_id)

      //set to default branch only viewing srp 
      const BRANCH_SHOW = Env.get('BRANCH_SHOW', 'false')
      if(BRANCH_SHOW === 'false') {
        v_code = BRANCH_CODE
      }

      if(update_scale != '') {
        await OpenPoVariableMod.update_scale_branch(v_code)
      }

      const { gulayList, csv_file_path, branches, is_connected } = await OpenPoVariableMod.weighingScaleReport(v_code)
      const stats = fs.statSync(csv_file_path)
      
      response.json({ gulayList, dateModify: stats.mtime, branches, is_connected })
    }
}

module.exports = OpenPoVariableController
