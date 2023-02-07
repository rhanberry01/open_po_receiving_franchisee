'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const Db = use('Database')
const Env = use('Env')
const BRANCH_CODE = Env.get('BRANCH_CODE', '')
const CustomException = use('App/Exceptions/CustomException')
const PosMod      = use('App/Models/Pos')


const moment = require('moment')
const leftPad = require('left-pad')
const roundPrecision = require('round-precision')
const TO_DATE = Env.get('TO_DATE')
const trim = require('trim')

class OpenPoFixed extends Model {

    async fetch_supplier_open() {
        let row = await Db.select('vendor_code', 'description')
                          .from('0_open_po_fix_supp')
                          .orderBy('description', 'asc')
        return row                         
    }
    /**
     * @param {string} inv_no 
     * @param {string} vendor_code 
     * @param {int} status 
     */
    async check_open_po_header_posted(inv_no, vendor_code, status=1) {
        let row = await Db.select('id')
                          .from('0_open_po')
                          .where('inv_no', inv_no)
                          .andWhere('vendor_code', vendor_code)
                          .andWhere('posted', status)
        return row.length
    }
    /**
     * 
     * @param {string} inv_no 
     * @param {string} vendor_code 
     */
    async fetch_open_po_header(inv_no, vendor_code) {
        let row = await Db.select('id', 'vendor_code', 'inv_no')
                          .from('0_open_po')
                          .where('inv_no', inv_no)
                          .andWhere('vendor_code', vendor_code)
                          .andWhere('posted', 0)
        return (row.length == 0) ? 0 : row[0]
    }
    /**
     * @param {int} temp_id 
     */
    async fetch_temporary_item(temp_id) {
        let row = await Db.select('*')
                          .from('0_open_po_details')
                          .where('temp_open_po_id', temp_id)
        return (row.length == 0) ? [] : row
    }

    async fetch_temporary_item_product_id(temp_id, prod_id){
        let row = await Db.select('*')
                          .from('0_open_po_details')
                          .where('temp_open_po_id', temp_id)
                          .where('prod_id', prod_id)
        return (row.length == 0) ? [] : row[0]
    }
    /**
     * count item temporary using lenght of array return value
     * @param {int} temp_id 
     * @param {string} inv_no 
     */
    async counts_items(temp_id) {
        let row = await Db.select('temp_open_po_id')
                          .joinRaw('FROM 0_open_po a INNER JOIN 0_open_po_details b ON a.id = b.temp_open_po_id')
                          .andWhere('a.posted', 0)
                          .andWhere('temp_open_po_id', temp_id)
        return row.length
    }
     /**
     * delete header item
     * @param {int} temp_id 
     * @param {string} po 
     */
    async delete_header_items(temp_id, vendor_code) {
        let res = await Db.table('0_open_po')
                          .where('id', temp_id)
                          .andWhere('posted', 0)
                          .andWhere('vendor_code', vendor_code)
                          .delete()
        return res
    }
    /**
     * delete items receiving details
     * @param {int} id 
     * @param {int} temp_id if null delete by specific id 
     */
    async delete_items(id, temp_id = null) {
        if (temp_id == null && id != null) {
            let res = await Db.table('0_open_po_details')
                              .where('d_id', id)
                              .delete()
            return res
        }
        let res = await Db.table('0_open_po_details')
                          .where('temp_open_po_id', temp_id)
                          .delete()
        return res
    }
    /**
     * @param {object} detail 
     * @param {int} user_id 
     */
    async add_open_po_header(detail, user_id){
        let data = {
            vendor_code: detail.p_vendor_code,
            supplier_name: await PosMod.fetch_vendor_name(detail.p_vendor_code),
            inv_no: detail.p_invoice_no,
            date_: detail.p_date_deliver,
            user_id: user_id,
        }

        let result = await Db.insert(data)
                             .into('0_open_po')
        return result[0]
    }
    /**
     * @param {object} detail 
     * @param {int} temp_id 
     */
    async check_open_items(detail, temp_id) {
        let row = await Db.select('*')
                          .from('0_open_po_details')
                          .where('temp_open_po_id', temp_id)
                          .where('barcode', detail.p_barcode)
                          .where('prod_id', detail.p_product_id)
        return row.length
    }
    /**
     * @param {object} detail 
     * @param {int} temp_id 
     */
    async add_open_po_items(detail, temp_id) {
        let net_price =  parseFloat(detail.p_qty) * parseFloat(detail.p_price)
        let data = { 
            temp_open_po_id: temp_id,
            prod_id: detail.p_product_id, 
            barcode: detail.p_barcode, 
            item_name: detail.p_item_name, 
            uom: detail.p_uom, 
            qty: detail.p_qty, 
            price: detail.p_price, 
            net_price: net_price.toFixed(2),
            markup: detail.p_markup
        }
        let result = await Db.insert(data)
                             .into('0_open_po_details')
        return result[0]
    }
    /**
     * @param {int} user_id 
     * @param {int} p_temp_id 
     * @param {string} p_vendor_code 
     */
    async fetch_current_open_po(user_id, p_temp_id, p_vendor_code) {
        let row = await Db.select('*')
                          .from('0_open_po')
                          .where('id', p_temp_id)
                          .andWhere('user_id', user_id)
                          .andWhere('vendor_code', p_vendor_code)
                          .andWhere('posted', 0)
        return (row.length == 0) ? 0 : row[0]
    }
    /**
     * @param {int} temp_id 
     */
    async fetch_open_details_product_id(temp_id) {
        let row = await Db.select('prod_id')
                          .from('0_open_po_details')
                          .where('temp_open_po_id', temp_id)
        return (row.length == 0) ? 0 : row
    }

    /**
     * 
     * @param {oject} srspos //rollback object
     * @param {int} user_id 
     * @param {object} supplier 
     * @param {int} receiving_counter 
     * @param {string} op 
     * @param {string} inv_no 
     * @param {string} remarks 
     * @param {string} date_ 
     */
    async add_receiving_ms(srspos, user_id, supplier, receiving_counter, op, inv_no, remarks, date_) {
        let supplier_id   = supplier.vendorcode
        let termid_id     = await PosMod.fetch_vendor_termid_id(srspos, supplier_id)
        let location      = 1
        let status        = 2
        let delivery_des  = "SAN ROQUE SUPERMARKET RETAIL SYSTEMS, INC."
        let delivery_date = moment(date_).format(TO_DATE) 
        let record_date   = moment().format('YYYY-MM-DD HH:mm:ss.SSS')
        let trans_date    = moment(date_).add(30, 'days').format('YYYY-MM-DD')

        let data = {
            receivingno: receiving_counter,
            purchaseorderid: 0,
            purchaseorderno: op,
            remarks: inv_no,
            vendorcode: supplier_id,
            description: supplier.description.replace(/'/g,""),
            address: supplier.address.replace(/'/g,""),
            contactperson: supplier.contactperson.replace(/'/g,""),
            EDA: delivery_date,
            cancellationdate: trans_date,
            terms: termid_id,
            deliverto: location,
            deliverydescription: delivery_des,
            deliveryaddress: '',
            createdby: user_id,
            datecreated: record_date,
            datereceived: record_date,
            receivedby: user_id,
            lastmodifiedby: user_id,
            lastdatemodified: record_date,
            postedby: user_id,
            posteddate: record_date,
            status: status,
            paid: '0',
            subtotal: '0',
            nettotal: '0',
            statusdescription: 'POSTED',
            otherexpenses: '0',
            forexrate: '1',
            forexcurrency: 'PHP',
            discount1: '0',
            discount2: '0',
            discount3: '0',
            datacollectorcontrolno: '0',
            requestforpaymentstatus: 'NULL',
            documentmismatchremarks: remarks.replace(/'/g,""),
        }

        await srspos.table('receiving').insert(data)
        
        let row = await srspos.raw(`SELECT IDENT_CURRENT('receiving') as last_id`)
        return row[0].last_id
    }

    /**
     * 
     * @param {object} products 
     * @param {object} po_line 
     * @param {float} amount 
     * @param {int} product_id 
     * @param {string} barcode 
     * @param {int} qty 
     * @param {string} uom 
     * @param {int} receiving_id 
     * @param {object} srspos //rollback
     */

    async add_receiving_line_ms(products, unitcost, amount, product_id, barcode, qty, uom, receiving_id, supplier_id, srspos) {
        let disc_value1 = (amount.disc_value1 == 0) ? '0' : roundPrecision(amount.disc_value1, 2)
        let disc_value2 = (amount.disc_value2 == 0) ? '0' : roundPrecision(amount.disc_value1, 2)
        let disc_value3 = (amount.disc_value3 == 0) ? '0' : roundPrecision(amount.disc_value1, 2)
        let description = products.description
       
        let vatable = (Number(products.pvatable) == 1) ? (amount.extended_price - (amount.extended_price/(1+Number(products.pvatable)/100)))  : 0
        let data = {
            receivingid: receiving_id.toString(),
            vendorproductcode: supplier_id,
            productid: product_id.toString(),
            productcode: products.productcode,
            description: description.replace(/'/g,""),
            uom: uom,
            unitcost: unitcost.toString(),
            qty: qty.toString(),
            netunitcost: '0',
            extended: amount.extended_price.toString(),
            pack: amount.pack.toString(),
            totalqtypurchased: amount.total_qty_purchase.toString(),
            remarks: '0',
            free: '0',
            lotno: null,
            expirationdate: null,
            discountcode1: amount.discount_code1,
            discountcode2: amount.discount_code2,
            discountcode3: amount.discount_code3,
            discamount1: amount.disc_amount1.toString(),
            discamount2: amount.disc_amount2.toString(),
            discamount3: amount.disc_amount3.toString(),
            percent1: amount.percent1.toString(),
            percent2: amount.percent2.toString(),
            percent3: amount.percent3.toString(),
            discplus1: amount.disc_plus1.toString(),
            discplus2: amount.disc_plus2.toString(),
            discplus3: amount.disc_plus3.toString(),
            withlotno: '0',
            expirable: '0',
            barcode: barcode,
            vat: vatable.toString(),
            ewt: '0',
            discvalue1: disc_value1.toString(),
            discvalue2: disc_value2.toString(),
            discvalue3: disc_value3.toString(),
            averagenetcost: null
        }
        
        await srspos.insert(data).into('receivingline')
        let row = await srspos.raw(`SELECT IDENT_CURRENT('receivingline') as last_id`)
        return row[0].last_id
    }
    /**
     * @param {object} products 
     * @param {float} qty 
     * @param {int} pack 
     * @param {int} receiving_id 
     * @param {object} srspos rollback
     */

    async add_receive_products_ms(products, qty, pack, receiving_id, srspos) {
        let data = {
            purchaseorderid: '0',
            receivingid: receiving_id,
            productid: products.productid,
            qty: (pack  *  qty)
        }
        
        await srspos.insert(data).into('receivedproducts')
    }

    async add_product_history_receiving(srspos, product, barcode, receiving_id, receiving_counter, selling_area_qty, pack, qty, unitcost, user_id){
        let quantity    = (pack * qty)
        let description = 'RECEIVED'

        let data = {
            productid : product.productid.toString(),
            barcode: barcode.toString(),
            transactionid: receiving_id.toString(),
            transactionno: receiving_counter.toString(),
            dateposted: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            transactiondate: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            description: description,
            beginningsellingarea: selling_area_qty.toString(),
            beginningstockroom: null,
            flowstockroom: '2',
            flowsellingarea: '2',
            sellingareain: quantity,
            sellingareaout: null,
            stockroomin: null,
            stockroomout: null,
            unitcost: unitcost.toString(),
            damagedin: null,
            damagedout: null,
            layawayin: null,
            layawayout: null,
            onrequestin: null,
            onrequestout: null,
            postedby: user_id,
            datedeleted: null,
            deletedby: null,
            movementcode: '_DR',
            terminalno: null,
            lotno: 0,
            expirationdate: null,
            SHAREWITHBRANCH: 0,
            CANCELLED:0,
            CANCELLEDBY: '',
            BeginningDamaged: null,
            FlowDamaged: null
        }

        await srspos.insert(data)
                    .into('producthistory')
        return true
    }

    /**
     * 
     * @param {float} total_new_cost 
     * @param {float} qty 
     * @param {int} pack 
     * @param {int} product_id 
     * @param {object} srspos rollback
     */
    async update_products_cost(total_new_cost, selling_area_qty, qty, pack, product_id, srspos) {
        let total_new_qty = parseFloat(qty) * parseFloat(pack)
        let data = {
            costofsales: total_new_cost,
            sellingarea: parseFloat(selling_area_qty) + parseFloat(total_new_qty),
            lastdatemodified: moment().format('YYYY-MM-DD HH:mm:ss.SSS')
        }

        await srspos.table('products')
                    .where('productid', product_id)
                    .update(data)
    }
    /**
     * 
     * @param {float} new_cost 
     * @param {string} supplier_id 
     * @param {int} product_id 
     * @param {object} srspos 
     */

    async update_vendor_products(new_cost, supplier_id, product_id, srspos){
        let data = {
            cost: roundPrecision(new_cost, 4),
            averagecost: roundPrecision(new_cost, 4),
            averagenetcost: roundPrecision(new_cost, 4)
        }

        await srspos.table('vendor_products')
                    .where('vendorcode', supplier_id)
                    .where('productid', product_id)
                    .update(data)
    }
    /**
     * @param {object} price_details 
     */
    async add_price_change_history(data, srspos){
        await srspos.insert(data)
                    .into('pricechangehistory')
    }
    /**
     * 
     * @param {float} final_srp 
     * @param {object} srspos 
     * @param {int} barcode 
     */
    async update_pos_srp(final_srp, srspos, barcode) {
        let data = {
            srp: final_srp,
            lastdatemodified:  moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
        }

        await srspos.table('pos_products')
                    .where('barcode', barcode)
                    .update(data)
    }
    /**
     * @param {float} rr_sub_total 
     * @param {float} rr_net_total 
     * @param {int} receiving_id 
     * @param {object} srspos rollback 
     */
    async update_receiving_sub_total(rr_sub_total, rr_net_total, receiving_id, srspos) {
        let data = {
            subtotal: rr_sub_total + 0,
            nettotal: rr_net_total + 0
        }
        await srspos.table('receiving')
                    .where('receivingid', receiving_id)
                    .update(data)
    }
     /**
     * @param {int} recounter 
     * @param {int} temp_id 
     * @param {object} srs_receiving rolbback mysql
     */
    async update_receiving(recounter, temp_id, srs_receiving) {
        let data = {
            posted : 1,
            rr_no: recounter
        }
        await srs_receiving.table('0_open_po')
                           .where('id', temp_id)
                           .update(data)
    }
     /**
     * 
     * @param {int} ig_counter 
     * @param {string} company 
     * @param {string} supplier_id 
     * @param {int} user_id 
     * @param {string} movement_code 
     * @param {object} srspos rollback 
     */
    async add_receiving_movement(ig_counter, company, supplier_id, user_id, movement_code, srspos) {
        let today = moment().format(TO_DATE) + ' 00:00:00'
        let data = {
            movementno : ig_counter.toString(),
            movementcode: movement_code,
            referenceno: '',
            sourceinvoiceno:  '',
            sourcedrno:  '',
            todescription: 'SELLING AREA',
            toaddress: '',
            contactperson: '',
            fromdescription: company,
            fromaddress: '',
            datecreated: today,
            lastmodifiedby: user_id.toString(),
            lastdatemodified: today,
            status: '2',
            postedby: user_id.toString(),
            posteddate: today,
            terms: '0',
            transactiondate: today,
            fieldstylecode1: '',
            nettotal: '0',
            statusdescription: 'POSTED',
            totalqty: '0',
            createdby: user_id.toString(),
            remarks: '',
            customercode: '',
            vendorcode: supplier_id,
            branchcode: '',
            cashdiscount: '',
            fieldStylecode: '',
            tobranchcode: '',
            fieldStylecode: '',
            tobranchcode: '',
            frbranchcode: '',
            sourcemovementno: '0',
            countered: '0',
            transmitted: '0',
            WithPayable: '0',
            WithReceivable: '0',
            OtherExpenses: '0',
            ForexRate: '1',
            ForexCurrency: 'PHP',
            SalesmanID: '0',
            RECEIVEDBY: '',
        }

        await srspos.insert(data)
                    .into('movements')
        
        let row = await srspos.raw(`SELECT IDENT_CURRENT('movements') as last_id`)
        return row[0].last_id
    }

    /**
     * @param {int} receiving_movement_id 
     * @param {object} temporary_items 
     * @param {object} products 
     * @param {float} qty 
     * @param {int} pack 
     * @param {int} barcode 
     * @param {object} srspos rollback 
     */
    async add_receiving_movement_line(receiving_movement_id, temporary_items, products, qty, pack, barcode, srspos) {
        let extended    = Math.round(parseFloat(products.costofsales) * Math.abs(qty) + 0)
        let description = products.description

        let data = {
            MovementID: receiving_movement_id,
            ProductID: temporary_items.prod_id,
            ProductCode: products.productcode,
            Description: description.replace(/'/g,""),
            uom: temporary_items.uom,
            unitcost: products.costofsales,
            qty: Math.abs(qty),
            extended: extended,
            pack: pack,
            barcode: barcode
        }

        await srspos.insert(data)
                    .into('movementline')
        
        let row = await srspos.raw(`SELECT IDENT_CURRENT('movementline') as last_id`)
        return row[0].last_id
    }

    async add_product_history_auto_gained(srspos, product, barcode, movement_line_id, ig_counter, user_id)  {
        let quantity    = product.sellingarea
        let description = 'AUTO INVENTORY GAIN'

        let data = {
            productid : product.productid.toString(),
            barcode: barcode.toString(),
            transactionid: movement_line_id.toString(),
            transactionno: ig_counter.toString(),
            dateposted: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            transactiondate: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            description: description,
            beginningsellingarea: quantity.toString(),
            beginningstockroom: null,
            flowstockroom: '2',
            flowsellingarea: '2',
            sellingareain: Math.abs(quantity),
            sellingareaout: null,
            stockroomin: null,
            stockroomout: null,
            unitcost: product.costofsales.toString(),
            damagedin: null,
            damagedout: null,
            layawayin: null,
            layawayout: null,
            onrequestin: null,
            onrequestout: null,
            postedby: user_id,
            datedeleted: null,
            deletedby: null,
            movementcode: 'AIG',
            terminalno: null,
            lotno: 0,
            expirationdate: null,
            SHAREWITHBRANCH: 0,
            CANCELLED:0,
            CANCELLEDBY: '',
            BeginningDamaged: null,
            FlowDamaged: null
        }

        await srspos.insert(data)
                    .into('producthistory')
        return true
    }

    /**
     * @param {object} srspos 
     * @param {int} prod_id 
     */
    async update_products_gained_qty(srspos, prod_id) {
        let data = {
            sellingarea: 0,
            lastdatemodified: moment().format('YYYY-MM-DD HH:mm:ss.SSS')
        }

        await srspos.table('products')
                    .where('productid', prod_id)
                    .update(data)
    }

    async update_movement_ms(srspos, extended, qty, receiving_movement_id) {
        let data = {
            NetTotal: extended.toString(),
            totalqty: qty.toString()
        }
        await srspos.table('movements')
                    .where('movementid', receiving_movement_id)
                    .update(data)
    }
    
    async post_auto_gained(srspos, srs_receiving, receiving, temp_id, remarks, inv_no, user_id, selling_area_negative) {
        let movement_code = 'AIG'
        let aig_counter   =  await PosMod.fetch_counter(srspos, movement_code)
        let ig_counter    = leftPad(aig_counter, 10, 0)
        let po_id         = receiving.id
        let supplier_id   = receiving.vendor_code
        let company       = await PosMod.get_company()
        
        let receiving_movement_id = await this.add_receiving_movement(ig_counter, company, supplier_id, user_id, movement_code, srspos)

        let qty      = 0
        let extended = 0

        for (const productid of selling_area_negative) {
            let products   = await PosMod.fetch_products(srspos, productid)
            if (products.sellingarea >= 0) {
                await srspos.rollback()
                await srs_receiving.rollback()
                throw new CustomException({ message: `Product id is not negative ${productid}` }, 401)
            }

            let temporary_items = await this.fetch_temporary_item_product_id(temp_id, productid)
            let barcode  = temporary_items.barcode
            let pos_prod = await PosMod.fetch_pos_product({ barcode }, 'qty', srspos)
            let pack     = parseFloat(pos_prod[0].qty) / parseFloat(pos_prod[0].qty)
            let qty_s    = parseFloat(products.sellingarea) 

                       qty = qty + Math.abs(parseFloat(products.sellingarea))
            let extended_s = parseFloat(extended + Math.round(parseFloat(products.costofsales) * Math.abs(qty_s)))
                extended   = extended_s.toFixed(4)
            
            let movement_line_id = await this.add_receiving_movement_line(receiving_movement_id, temporary_items, products, qty_s, pack, barcode, srspos)

            await this.add_product_history_auto_gained(srspos, products, barcode, movement_line_id, ig_counter, user_id) 
            await this.update_products_gained_qty(srspos, productid)
        } // end loop negative

        await this.update_movement_ms(srspos, extended, qty, receiving_movement_id)
        return receiving_movement_id
    }
    /**
     * 
     * @param {object} srspos rollback
     * @param {srs_receiving} srs_receiving rollback
     * @param {int} receiving_movement_id 
     * @param {int} productid 
     */
    async fetch_gain_qty(srspos, srs_receiving, receiving_movement_id, productid) {
        let row = await srspos.select('qty')
                        .from('movementline')
                        .where('movementid', receiving_movement_id)
                        .andWhere('productid', productid)
        if (row.length == 0) {
            await srspos.rollback()
            await srs_receiving.rollback()
            throw new CustomException({ message: `No item fetch movementline ${productid} | ${receiving_movement_id}` }, 401)
        }
        return row[0].qty
    }
    async add_product_history_auto_loss(srspos, product, barcode, gain_qty, lost_movement_id, il_counter, user_id) {
        let quantity    = product.sellingarea
        let description = 'AUTO INVENTORY LOSS'
        
        let data = {
            productid : product.productid.toString(),
            barcode: barcode.toString(),
            transactionid: lost_movement_id.toString(),
            transactionno: il_counter.toString(),
            dateposted: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            transactiondate: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            description: description,
            beginningsellingarea: quantity.toString(),
            beginningstockroom: null,
            flowstockroom: '2',
            flowsellingarea: '2',
            sellingareain: null,
            sellingareaout: gain_qty,
            stockroomin: null,
            stockroomout: null,
            unitcost: product.costofsales.toString(),
            damagedin: null,
            damagedout: null,
            layawayin: null,
            layawayout: null,
            onrequestin: null,
            onrequestout: null,
            postedby: user_id,
            datedeleted: null,
            deletedby: null,
            movementcode: 'AIL',
            terminalno: null,
            lotno: 0,
            expirationdate: null,
            SHAREWITHBRANCH: 0,
            CANCELLED:0,
            CANCELLEDBY: '',
            BeginningDamaged: null,
            FlowDamaged: null
        }

        await await srspos.insert(data)
                    .into('producthistory')
        return true
    }
    async update_products_loss_qty(srspos, productid, update_qty) {
        let data = {
            sellingarea: update_qty,
            lastdatemodified: moment().format('YYYY-MM-DD HH:mm:ss.SSS')
        }
         
        await srspos.table('products')
                    .where('productid', productid)
                    .update(data)
    }
    /**
     * 
     * @param {object} srspos rollback
     * @param {object} srs_receiving //rollback
     * @param {object} receiving 
     * @param {int} temp_id 
     * @param {string} remarks 
     * @param {string} inv_no 
     * @param {int} user_id 
     * @param {int} receiving_movement_id 
     * @param {array} selling_area_negative 
     */
    async post_auto_loss(srspos, srs_receiving, receiving, temp_id, remarks, inv_no, user_id, receiving_movement_id, selling_area_negative) {
        let movement_code = 'AIL'
        let ail_counter   = await PosMod.fetch_counter(srspos, 'AIL')
        let il_counter    = leftPad(ail_counter, 10, 0)
        let po_id         = receiving.id
        let supplier_id   = receiving.vendor_code
        let company       = await PosMod.get_company()

        let lost_movement_id = await this.add_receiving_movement(il_counter, company, supplier_id, user_id, movement_code, srspos)

        let qty      = 0
        let extended = 0

        for (const productid of selling_area_negative) {
            let products   = await PosMod.fetch_products(srspos, productid)
            let temporary_items = await this.fetch_temporary_item_product_id(temp_id, productid)
            let barcode  = temporary_items.barcode
            let pos_prod = await PosMod.fetch_pos_product({ barcode }, 'qty', srspos)

            let gain_qty = await this.fetch_gain_qty(srspos, srs_receiving, receiving_movement_id, productid)
            let pack = pos_prod[0].qty / pos_prod[0].qty
            let qty_s = gain_qty * pack
            
            qty = qty + Math.abs(parseFloat(gain_qty))
            let extended_s = parseFloat(extended + Math.round(parseFloat(products.costofsales) * Math.abs(qty_s)))
                extended   = extended_s.toFixed(4)

                await this.add_receiving_movement_line(lost_movement_id, temporary_items, products, qty_s, pack, barcode, srspos)
                await this.add_product_history_auto_loss(srspos, products, barcode, gain_qty, lost_movement_id, il_counter, user_id) 
            
            let update_qty = products.sellingarea - gain_qty
            await this.update_products_loss_qty(srspos, productid, update_qty)
        } // end loop negative

        await this.update_movement_ms(srspos, extended, qty, lost_movement_id)
    }
    
    async post_receiving(temp_id, inv_no, remarks, vendor_code, user_id, selling_area_negative) {
        let srspos = await Db.connection('srspos').beginTransaction()
        let srs_receiving = await Db.connection().beginTransaction()

        let receiving = await this.fetch_current_open_po(user_id, temp_id, vendor_code)
        if (receiving == 0) {
            throw new CustomException({ message: `THIS WAS ALREADY POSTED` }, 401)
        }

        //AUTO GAINED
        let receiving_movement_id = 0
        if (selling_area_negative != null) {
            receiving_movement_id = await this.post_auto_gained(srspos, srs_receiving, receiving, temp_id, remarks, inv_no, user_id, selling_area_negative)
        }

        //RECEIVING
        let recounter         = await PosMod.fetch_counter(srspos, 'RE')
        let receiving_counter = leftPad(recounter, 10, 0)
        let po_id             = receiving.id
        let supplier_id       = receiving.vendor_code
        let date_             = moment(receiving.date_).format('YYYY-MM-DD')
        let op                = `OP${po_id}`
        let rr_sub_total      = 0
        let rr_net_total      = 0 
        let supplier          = await PosMod.fetch_vendor(supplier_id)
        
        let receiving_id      = await this.add_receiving_ms(srspos, user_id, supplier, receiving_counter, op, inv_no, remarks, date_)
        
        let temporary_items = await this.fetch_temporary_item(temp_id)
        for (const row of temporary_items) {
            let product_id = row.prod_id
            let barcode    = row.barcode
            let qty        = row.qty
            let uom        = row.uom
            let markup     = row.markup

            let products   = await PosMod.fetch_products(srspos, product_id)
            if (products == "") {
                await srspos.rollback()
                throw new CustomException({ message: `No item fetch in Products ${product_id}` }, 401)
            }

            let pack = await PosMod.fetch_uom_qty(uom)
            let discount_code1 = ""
            let discount_code2 = ""
            let discount_code3 = ""

            let disc_amount1 = .0000
            let disc_amount2 = .0000
            let disc_amount3 = .0000

            let percent1 = 0
            let percent2 = 0
            let percent3 = 0

            let disc_plus1 = 0
            let disc_plus2 = 0
            let disc_plus3 = 0

            let disc_value1 = 0
            let disc_value2 = 0 
            let disc_value3 = 0

            let extended_price = row.price * qty

            let vendor_product_discount = await PosMod.fetch_vendor_product_discount(supplier_id, product_id)
            
            let disc_code1 = trim(vendor_product_discount.discountcode1)
            let disc_code2 = trim(vendor_product_discount.discountcode2)
            let disc_code3 = trim(vendor_product_discount.discountcode3)

            let deduc = 0
            if (disc_code1 != "") {
                let discount_details = await PosMod.fetch_discount_details(disc_code1)
                discount_code1   = disc_code1

                if(discount_details.amount != "") {
                    disc_amount1 = parseFloat(Number(discount_details.amount))
                }
                
                if(discount_details.percent != "") {
                    percent1 = parseFloat(Number(discount_details.percent))
                }

                if(discount_details.plus != "") {
                    disc_plus1   = parseFloat(Number(discount_details.plus))
                }
                
                deduc = (percent1 == 1) ? (disc_amount1/100) * extended_price : disc_amount1
                if (disc_plus1 == 1) {
                    extended_price += deduc
                } else {
                    extended_price -= deduc
                }
                disc_value1 = deduc / parseFloat(qty)
            }

            if (disc_code2 != "") {
                let discount_details = await PosMod.fetch_discount_details(disc_code2)
                discount_code2   = disc_code2

                if(discount_details.amount != "") {
                    disc_amount2 = parseFloat(Number(discount_details.amount))
                }
                
                if(discount_details.percent != "") {
                    percent2 = parseFloat(Number(discount_details.percent))
                }

                if(discount_details.plus != "") {
                    disc_plus2   = parseFloat(Number(discount_details.plus))
                }
                
                deduc = (percent2 == 1) ? (disc_amount2/100) * extended_price : disc_amount2
                if (disc_plus2 == 1) {
                    extended_price += deduc
                } else {
                    extended_price -= deduc
                }
                disc_value2 = deduc / parseFloat(qty)
            }

            if (disc_code3 != "") {
                let discount_details = await PosMod.fetch_discount_details(disc_code3)
                discount_code3   = disc_code3

                if(discount_details.amount != "") {
                    disc_amount3 = parseFloat(Number(discount_details.amount))
                }
                
                if(discount_details.percent != "") {
                    percent3 = parseFloat(Number(discount_details.percent))
                }

                if(discount_details.plus != "") {
                    disc_plus3   = parseFloat(Number(discount_details.plus))
                }
                
                deduc = (percent3 == 1) ? (disc_amount3/100) * extended_price : disc_amount3
                if (disc_plus3 == 1) {
                    extended_price += deduc
                } else {
                    extended_price -= deduc
                }
                disc_value3 = deduc / parseFloat(qty)
            }

            rr_sub_total  += extended_price
            rr_net_total  += extended_price
            let total_qty_purchase = qty * pack

            let amount_obj = {
                discount_code1,
                discount_code2,
                discount_code3,
                disc_amount1,
                disc_amount2,
                disc_amount3,
                percent1,
                percent2,
                percent3,
                disc_plus1, 
                disc_plus2,
                disc_plus3,
                disc_value1, 
                disc_value2,  
                disc_value3, 
                total_qty_purchase,
                rr_net_total,
                rr_sub_total,
                pack,
                extended_price
            }
            await this.add_receiving_line_ms(products, row.price, amount_obj, product_id, barcode, qty, uom, receiving_id, supplier_id, srspos)
            await this.add_receive_products_ms(products, qty, pack, receiving_id, srspos)

            let selling_area_qty = await PosMod.fetch_selling_area_product(srspos, product_id)
            let product_history  = await this.add_product_history_receiving(srspos, products, barcode, receiving_id, receiving_counter, selling_area_qty, pack, qty, row.price, user_id)

            let new_cost       = parseFloat(products.costofsales)
            let old_stock      = parseFloat(products.sellingarea) + parseFloat(products.stockroom) + parseFloat(products.damaged)
            
            if (old_stock + total_qty_purchase != 0) {
                let old_stock_cost = parseFloat(old_stock) * parseFloat(products.costofsales)
                let old_stock_cost_extended = parseFloat(old_stock_cost) + parseFloat(extended_price)
                new_cost = roundPrecision(parseFloat(old_stock_cost_extended/(old_stock + total_qty_purchase)), 4)
            }

            await this.update_products_cost(new_cost, selling_area_qty, qty, pack, product_id, srspos)
        }
        await this.update_receiving_sub_total(rr_sub_total, rr_net_total, receiving_id, srspos)

        //AUTO INVENTORY LOSS
        if (selling_area_negative != null) {
            await this.post_auto_loss(srspos, srs_receiving, receiving, temp_id, remarks, inv_no, user_id, receiving_movement_id, selling_area_negative)
        }

        await this.update_receiving(recounter, temp_id, srs_receiving)
        
        await srs_receiving.commit()
        await srspos.commit()
        return recounter
    }
}

module.exports = new OpenPoFixed
