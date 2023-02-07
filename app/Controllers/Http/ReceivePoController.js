'use strict'
const ReceivePoMod    = use('App/Models/ReceivePo')
const PosMod      = use('App/Models/Pos')
const CustomException = use('App/Exceptions/CustomException')
const Env = use('Env')
const Helpers = use('Helpers')
const Redis = use('Redis')
const Db = use('Database')
const fs = require('fs')
const PDFDocument = require('pdfkit');
const moment = require('moment')
const _ = require('lodash')
const path = require('path')
const TO_DATE = Env.get('TO_DATE')
const BRANCH_CODE = Env.get('BRANCH_CODE')

class ReceivePoController { 

    async fetch_po({ request, response }) {

        let user_id  = await Redis.get(request.user_id)
        let { p_po } = request.only(['p_po'])
        
        if (p_po == null) {
          throw new CustomException({ message: `P.O is required`})
        }

        let po                = await ReceivePoMod.fetch_po(p_po) 
        let total_qty_receive = await ReceivePoMod.sum_total_qty_receive(po)        
        let total_qty_ordered = await ReceivePoMod.sum_total_qty_ordered(po) 
        
        await this.check_po_status(total_qty_receive, total_qty_ordered, po)

        let temp_id   = ""
        let inv_no    = ""
        let status
        let receiving = await ReceivePoMod.fetch_receiving(p_po)
        
        let checkTransit = await ReceivePoMod.fetch_transit_po(p_po)
        if(checkTransit == 1) {
            throw new CustomException({ message: `Opss ang P.O na ito ay pang transit hindi maaring ma receive sa P.O Receive Pa contact si Sir John Paul para sainyong concern`})
        }

        if (receiving != 0) {
             temp_id = receiving.id
             inv_no = receiving.inv_no
        }

        if (user_id != receiving.user_id && receiving != 0) {
            throw new CustomException({ message: `Ang P.O na ito ay ginamit na ni ${await PosMod.fetch_name( receiving.user_id )}` })
        }

        let to_date       =  moment().format(TO_DATE)
        let supplier_name = po.supplier_name
        let supplier_id   = po.supplier_id
        let rs_pending        = await ReceivePoMod.fetch_rs_pending({ supplier_id })
        let { rs_message }    = await this.printMessage(rs_pending)
        
        Db.close()
        response.status(200).json({ 
            to_date,
            supplier_name, 
            supplier_id,
            inv_no,
            rs_pending, 
            temp_id,
            rs_message
        })
    }

    async printMessage(rs_pending) {
        let rs_message = ''
        let countMsg = 0
        let countMsgs = 0
        if(rs_pending != 0) {
            for(const row of rs_pending) {
                if(row.pending == 0 && row.picked_up == null) {
                    if (countMsg++ == 0) {
                        rs_message += "<h6>OPSS MAYRON SI SUPPLIER NA PENDING RS PAKI CHAT SI B.O NA MAG POST NA NG MGA NA SCAN<i class='fa fa-warning'> </i></h6>"
                    }
                    rs_message += `RS # ${(row.movement_no === 0 || row.movement_no === null) ? row.rs_id : row.movement_no} <br>`
                } else {
                    if (countMsgs++ == 0) {
                        rs_message += "<h6>OPSS MAYRON SI SUPPLIER NA HINDI PA NA PICK UP NA MGA RETURN ITEM PAKI SABIHAN SI SUPPLIER NA MAG PICK NG ITEM KAY B.O PARA MAPAYAGAN MA POST ANG TRANSACTION NA ITO . !!<br> KUNG KAILANGAN MA POST AGAD PAKI PINDOT PO ANG REQUEST<i class='fa fa-warning'> </i></h6> <br>"
                    }
                    rs_message += `RS # ${(row.movement_no === 0 || row.movement_no === null) ? row.rs_id : row.movement_no} <br>`
                }
            }
        }
        return { rs_message, countMsg }
    }

    async check_po_status(total_qty_receive, total_qty_ordered, { status }) {
        let message = ""
        if (total_qty_receive == total_qty_ordered) {
            throw new CustomException({ message: "Ang P.O # na ito ay na received na !!"})
        }

        if (status === 1 || status === 2) {
            message = "Ang P.O# na ito ay na CANCELLED na, Maaring mag inform sa purchser"
            throw new CustomException({ message }, 401)
        }

        if (status === 3) {
          message = "Ang P.O# na ito ay na EXPIRED na, Maaring mag inform sa purchser"
          throw new CustomException({ message }, 401)
        }

        return true
    }

    async fetch_temporary_items({request, response}) {
        let { p_temp_id, p_po } = request.only(['p_temp_id', 'p_po'])
        
        let po                = await ReceivePoMod.fetch_po(p_po) 
        
        let orderNo = JSON.parse(await Redis.get('orderNo'+request.user_id))
        if(orderNo == null) {
          await Redis.set('orderNo'+request.user_id, po.order_no)
        }

        if(orderNo != po.order_no) {
          await Redis.set('orderNo'+request.user_id, po.order_no)
          await Redis.del('pending_po'+request.user_id)
          await Redis.del('po_list'+request.user_id)
        }

        let user_id           = await Redis.get(request.user_id)
        let order_no          = po.order_no
        let total_qty_receive = await ReceivePoMod.sum_total_qty_receive(po)        
        let total_qty_ordered = await ReceivePoMod.sum_total_qty_ordered(po) 
        
        let total_sku         = 0
        let temporary_items   = []
        
        if (p_temp_id != "") {
            temporary_items  = await ReceivePoMod.fetch_temporary_items(p_temp_id)
            total_sku        = await ReceivePoMod.count_total_sku(p_po)
        }
        
        let total_all_sku    = await ReceivePoMod.count_total_all_sku(p_po)
        let total_qty_scanned = await ReceivePoMod.sum_total_qty_scanned(p_po)

        // let pending_po = JSON.parse(await Redis.get('pending_po'+request.user_id))
        // if(pending_po == null) {
        //   pending_po = JSON.stringify(await ReceivePoMod.fetch_pending_po(user_id))
        //   await Redis.set('pending_po'+request.user_id, pending_po)
        // }
        
        let po_list = JSON.parse(await Redis.get('po_list'+request.user_id))
        if(po_list == null) {
          po_list   = await ReceivePoMod.fetch_po_items(order_no)
          await Redis.set('po_list'+request.user_id, JSON.stringify(po_list))
        }

        let po_items = []
        let receive_all_items = await ReceivePoMod.fetch_all_receive_items(order_no)

        receive_all_items = JSON.parse(JSON.stringify(receive_all_items))
        let qty_receive
        for(const row of po_list) {
           let items = _.filter(receive_all_items, { prod_id: parseInt(row.stock_id)})
           if(items.length == 0) {
                qty_receive = 0
                po_items.push({
                    order_no: row.order_no,
                    description: row.description,
                    ord_qty: parseFloat(row.ord_qty),
                    qty_scanned: qty_receive,
                    unit_id: row.unit_id,
                    stock_id: row.stock_id
                })
           } else {
               qty_receive = 0
               for(const sum of items) {
                  qty_receive += parseFloat(sum.qty)
               }
                po_items.push({
                    order_no: row.order_no,
                    description: row.description,
                    ord_qty: parseFloat(row.ord_qty),
                    qty_scanned: qty_receive,
                    unit_id: row.unit_id,
                    stock_id: row.stock_id
                })
           }
        }
        let last_item_scanned = await ReceivePoMod.fetch_last_item_scanned(p_temp_id)
        if(last_item_scanned != 0) {
            last_item_scanned = _.find(po_items, { stock_id: last_item_scanned.prod_id.toString() })
            if(last_item_scanned != undefined) {
                last_item_scanned.remaining = last_item_scanned.ord_qty - last_item_scanned.qty_scanned
                last_item_scanned = [last_item_scanned]
            } else {
                last_item_scanned = []
            }
        } else {
            last_item_scanned = []
        }
        
        Db.close()
        response.status(200).send({ 
            temporary_items,
            total_qty_scanned,
            // pending_po,
            po_items,
            total_sku,
            total_qty_receive,
            total_qty_ordered,
            order_no,
            total_all_sku,
            last_item_scanned
        })
    }

    async delete_items({request, response}) {
        let { p_temp_id, p_po, p_id } = request.post(['p_temp_id', 'p_po', 'p_id'])
        let count_items = await  ReceivePoMod.counts_items(p_temp_id, p_po)
        if (count_items == 1) {

            await ReceivePoMod.delete_header_items(p_temp_id, p_po)
        }

        await ReceivePoMod.delete_items(p_id)
        Db.close()
        response.status(200).send({ count_items })
    }

    async fetch_barcode({ request, response }) {
        
        let { p_barcode, p_qty, p_po, p_order_no, p_temp_id, p_inv_no } = request.post(['p_barcode', 'p_qty', 'p_po', 'p_order_no', 'p_temp_id', 'p_inv_no'])

        await ReceivePoMod.fetch_po(p_po) 
        let where_pos    = { barcode: p_barcode }
        let field_pos    = 'description, uom, productid, qty, pricemodecode, barcode, srp'
        let pos_products = await PosMod.fetch_pos_product(where_pos, field_pos)
        let user_id      = await Redis.get(request.user_id)

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
        let cost_of_sales = await ReceivePoMod.CostOfSales(product_id, p_order_no)
        if (srp <= cost_of_sales) {
            throw new CustomException({ message: `CostOfSales is greater than SRP` }, 401)
        }

        let receive_qty = await ReceivePoMod.receive_qty(product_id, p_order_no, p_qty)
        let po__qty     = await ReceivePoMod.po_qty(product_id, p_order_no)

        if (po__qty < receive_qty ) {
            throw new CustomException({ message: `Received quantity greater than remaining PO quantity. Total Received  QTY ${receive_qty} | PO QTY ${po__qty}` }, 401)
        }
        p_po.toUpperCase()

        let isDecimal = await ReceivePoMod.check_barcode_decimal(p_barcode)
        if(isDecimal == 0 && Number.isInteger(parseFloat(p_qty)) == false) {
            throw new CustomException({ message: `Ang item na ito ay hindi maaring lagyan ng decimal` }, 401)
        }
        
        if (p_temp_id == "" || p_temp_id == null) {
            p_temp_id = await ReceivePoMod.add_receiving_header(p_order_no, p_po, p_inv_no, user_id)
        }

        let check_barcode = await ReceivePoMod.check_barcode_receiving(p_barcode, product_id, p_temp_id)
        

        if (check_barcode == 0) {
            await ReceivePoMod.add_receiving_details(p_temp_id, product_id, p_barcode, description, uom, p_qty)
        } else {
            await ReceivePoMod.update_receiving_details(p_temp_id, product_id, p_barcode, p_qty)
        }
        let temporary_items = []
        if (p_temp_id != "") {
          temporary_items  = await ReceivePoMod.fetch_temporary_items(p_temp_id)
        }

        await ReceivePoMod.update_last_item_scanned(p_barcode, product_id, p_temp_id, temporary_items)
        Db.close()
        response.status(200).send({ p_temp_id, temporary_items })
    }

    async post_receiving({ request, response }) {

        let user_id      = await Redis.get(request.user_id)
        let { p_inv_no, p_po, p_temp_id, p_remarks, file} = request.only(['p_inv_no', 'p_po', 'p_temp_id', 'p_remarks', 'file'])
       
        let po_detail = await ReceivePoMod.fetch_receiving_po(p_po, p_temp_id, user_id)
        if (po_detail == 0) {
            throw new CustomException({ message: `PO is no item yet` }, 401)
        }
        if (p_inv_no === null) {
            throw new CustomException({ message: `Invoice no # is required` }, 401)
        }
        
        if (p_remarks == null) {
            p_remarks = ''
        }
        
        let supplier_id = po_detail.supplier_id
        /*  remove sa price survey at free goods */
        let rs_pending  = await ReceivePoMod.fetch_rs_pending({ supplier_id })
        let notify_rs   = false
        
        if (rs_pending != 0) {

            let check_po_code = await ReceivePoMod.fetch_po_code(p_po, user_id, p_temp_id)
            if (check_po_code == 0) {
                notify_rs = true
            }
        }
        
        let rs_message = ''
        if(notify_rs == true) {
            let { rs_message, countMsg } = await this.printMessage(rs_pending)
            if(countMsg >= 0) {
                throw new Error(rs_message)
            } 
        }
        /* 
            remove sa price survey at free goods 
        */
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

        p_po.toUpperCase()
        let receiving_no
        if (selling_area_negative.length == 0) {
           receiving_no = await ReceivePoMod.post_receiving(p_temp_id, p_inv_no, p_remarks, p_po, BRANCH_CODE, user_id)
        } else {
           receiving_no = await ReceivePoMod.post_receiving(p_temp_id, p_inv_no, p_remarks, p_po, BRANCH_CODE, user_id, selling_area_negative)
        }

        if(receiving_no == false) {
          throw new CustomException({ message: `Something wrong in server please try to logout and login again` }, 401)
        }

        try {
          await this.upload_file_invoice(request, p_po, receiving_no, user_id)
        } catch (error) {
          console.log(error.toString())
          if(error.message) {
            throw new CustomException({ message : error.message })        
          }
        }

        if(rs_pending != 0) {
          await ReceivePoMod.update_receiving_code(p_po, user_id, rs_pending)
        }
        Db.close()
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
        
        if (count_pdf >=2 && count_img == 0) {
          throw new CustomException({ message: 'ISA LANG ANG MAARI MONG ILAGAY NA PDF FILE HINDI PWEDING PAG SAMAHIN ANG IMAGE AT PDF' }, 401)
        } 
        
        if (count_pdf >=2 && count_img !== 0) {
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
    }

    async fetch_pending_po({ request, response }) {
        let user_id    = await Redis.get(request.user_id)
        let pending_po = await ReceivePoMod.fetch_pending_po(user_id)
        Db.close()
        response.status(200).send({ pending_po })
    }

    async fetch_pending_po_request({ request, response }) {
      let user_id    = await Redis.get(request.user_id)
      let pending_po_request = await ReceivePoMod.fetch_pending_po_request(user_id)
      Db.close()
      response.status(200).send({ pending_po_request })
    }

    async fetch_po_inquiry({ request, response}) {
        let { p_rr_no, p_date_from, p_date_to } = request.only(['p_rr_no', 'p_date_from', 'p_date_to'])
        
        
        let list_po_inquirys = await ReceivePoMod.fetch_po_inquiry(p_rr_no, p_date_from, p_date_to)
        let list_po_inquiry = []

        for(const row of list_po_inquirys) {
          let file_name     = BRANCH_CODE+'~'+row.purchaseorderno.toUpperCase()+'~'+parseInt(row.receivingno)
          let path = Helpers.publicPath('scanned_invoice/invoice')+'/'+file_name+'.pdf'
          let isFileExist = fs.existsSync(path)
          
          list_po_inquiry.push({
            description: row.description,
            remarks: row.remarks,
            receivingno: row.receivingno,
            isFileExist: isFileExist
          })
        }
        Db.close()
        response.status(200).send({ list_po_inquiry })
    }

    async fetch_expected_delivery({ request, response}) {
        let { p_date_from, p_date_to } = request.only(['p_date_from', 'p_date_to'])
        
        let list_delivery = await ReceivePoMod.fetch_expected_delivery( p_date_from, p_date_to)
        Db.close()
        response.status(200).send({ list_delivery })
    }

    async fetch_po_list({ request, response}) {
        let { p_po_no } = request.only(['p_po_no'])
        let list_po = await ReceivePoMod.fetch_po_list( p_po_no )
        Db.close()
        response.status(200).send({ list_po })
    }

    async update_po({request, response}) {
        try {
            const { p_trans_id, p_trans_type } = request.only(['p_trans_id', 'p_trans_type'])

            const result = await ReceivePoMod.update_po( p_trans_id, p_trans_type )
            let message  = ""
            if(result != true) {
                message = result
            }
            response.status(200).send({ p_trans_id, message })
            Db.close()
        } catch (error) {
            console.log(error)
        }
       
    }

    async update_inv({ request, response}) {
        try {
            const { p_inv_no, p_po, p_temp_id } = request.only(['p_inv_no', 'p_po', 'p_temp_id'])
            let po                = await ReceivePoMod.fetch_po(p_po) 

            let isExist = await ReceivePoMod.isExistInvNo(p_inv_no)
            let status  = 'ok'
            let message = ''
            if(isExist) {
                if(po.supplier_id == isExist[0].supplier_id && isExist[0].po_id != po.order_no) {
                    status  = 'isExist'
                    message = `Ang invoice # na to ay nagamit na <br>
                    SUPPLIER NAME: (${po.supplier_name}) <br> P.O # (${p_po}) paki lagyan ng letter sa dulo 
                    <br>EXAMPLE: ${p_inv_no}-A Kapag ganun padin gawing letter B ang dulo kapag ganun parin alternate lang <br>
                    Hindi ka maaring mag post !!!`
                }
            } else {
                await ReceivePoMod.update_invoice(p_temp_id, p_inv_no)
            }
            Db.close()
            response.status(200).send({ status, message })
        } catch (error) {
            console.log(error)
        }
        
    }

    async requestPo({ request, response}) {
      let user_id    = await Redis.get(request.user_id)

      const { p_po, p_remarks } = request.all()
      const result = await ReceivePoMod.addCode(p_po, p_remarks, user_id)
      if(!result) {
        throw new CustomException({ message: 'Mayron ka ng existing request paki antay nalang na ma approve ng purchaser' }, 401)
      }
      response.status(200).send({  })
    }

    async post_upload_invoice({request, response}) {
      let user_id    = await Redis.get(request.user_id)
      let { p_name } = request.only(['p_name'])

      if(p_name == null || p_name == '') {
        throw new CustomException({ message: 'P.O # - RECEIVING NO is required' }, 401)
      }
      p_name = p_name.split('-')

      if(p_name.length <= 1 || p_name.length >= 3) {
        throw new CustomException({ message: 'Incorect Format Name' }, 401)
      }

      let p_po = p_name[0].toUpperCase()
      let receiving_no = parseInt(p_name[1])
      await this.upload_file_invoice(request, p_po, receiving_no, user_id)
      response.status(200).send({  })
    }
}

module.exports = ReceivePoController
