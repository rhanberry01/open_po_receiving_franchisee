'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const Db = use('Database')
const Env = use('Env')
const BRANCH_CODE = Env.get('BRANCH_CODE', '')
const CustomException = use('App/Exceptions/CustomException')
const PosMod = use('App/Models/Pos')
const TRANS_TYPE = 19

const moment = require('moment')
const leftPad = require('left-pad')
const roundPrecision = require('round-precision')
const TO_DATE = Env.get('TO_DATE')

class ReceivePoFree extends Model {

    /**
     * @param {string} p_po 
     */
    async fetch_po(p_po) {
        let row = await Db.connection('srs')
            .select('a.status', 'a.order_no', 'a.br_code', 'b.reference', 'trans_date', 'supplier_id', 'supplier_name', 'net_total', 'a.trans_type')
            .joinRaw('FROM purch_orders a INNER JOIN refs b ON a.order_no = b.trans_id AND a.trans_type = b.trans_type')
            .whereRaw('a.br_code = ? AND b.reference = ? LIMIT 1', [BRANCH_CODE, p_po])
        if (row.length === 0) {
            throw new CustomException({ message: `Invalid PO, Ang iyong P.O ay hindi pa updated o kaya hindi para sa branch na to !! , Pa inform ang purchaser or I'T programmer` }, 401)
        }
        return row[0]
    }
    /**
     * @param {object} param0 
     * @param {int} status ee check yung status ng rs sa b.o
     */
    async fetch_rs_pending({ supplier_id }, status = 0) {
        let row = await Db.connection('return_merchandise')
            .select('supplier_code', 'pending', 'rs_id', 'picked_up', 'movement_no')
            .from('0_rms_header')
            .where('supplier_code', supplier_id)
            .andWhere('pending', status)
            .whereNull('picked_up')
        return (row.length === 0) ? 0 : row
    }

    /**
     * sum lahat ng quantity na receive na sa p.o na item
     * @param {object} param0 
     */

    async sum_total_qty_receive({ order_no }) {
        let row = await Db.connection('receiving_new')
            .joinRaw('FROM 0_free a INNER JOIN 0_free_details b ON a.id = b.temp_receiving_id')
            .where('a.posted', 1)
            .andWhere('a.po_id', order_no)
            .sum('qty as qty')
        return (row[0].qty == null) ? 0 : row[0].qty
    }

    /**
     * total lahat ng p.o item 
     * @param {object} param0 
    */

    async sum_total_qty_ordered({ order_no }) {
        let row = await Db.connection('srs')
            .from('purch_order_details')
            .where('order_no', order_no)
            .andWhere('trans_type', TRANS_TYPE)
            .sum('ord_qty as ord_qty')
        return (row[0].ord_qty == null) ? 0 : row[0].ord_qty
    }

    /**
     * @param {string} po_no 
     */
    async fetch_receiving(po_no) {
        let row = await Db.connection('receiving_new')
            .from('0_free')
            .where('po_no', po_no)
            .andWhere('posted', 0)
        return (row.length == 0) ? 0 : row[0]
    }

    /**
     * @param {int} temp_id 
    */

    async fetch_temporary_items(temp_id) {
        let row = await Db.connection('receiving_new')
            .from('0_free_details')
            .where('temp_receiving_id', temp_id)
            .orderBy('id', 'ASC')
        return row
    }


    /**
     * sum lahat ng item ng p.o posted or not posted
     * @param {string} po_no 
    */
    async sum_total_sku(po_no) {
        let row = await Db.connection('receiving_new')
            .select('prod_id')
            .joinRaw('FROM 0_free a INNER JOIN 0_free_details b ON a.id = b.temp_receiving_id')
            .where('po_no', po_no)
            .andWhere('posted', 0)
            .groupBy('prod_id')
        return row.length
    }

    /**
     *sum lahat ng quantity na posted na sa p.o
     * @param {string} po_no 
    */
    async sum_total_qty_posted(po_no) {
        let row = await Db.connection('receiving_new')
            .joinRaw('FROM 0_free a  INNER JOIN 0_free_details b ON a.id = b.temp_receiving_id')
            .where('a.po_no', po_no)
            .andWhere('a.posted', 1)
            .sum('b.qty as qty')
        return (row[0].qty == null) ? 0 : row[0].qty
    }

    /**
    * total lahat ng item or sku na hindi pa posted sa p.o
    * @param {string} po_no 
   */

    async sum_total_qty_scanned(po_no) {
        let row = await Db.connection('receiving_new')
            .select('a.po_no')
            .joinRaw('FROM 0_free a INNER JOIN 0_free_details b ON a.id = b.temp_receiving_id')
            .where('a.po_no', po_no)
            .andWhere('a.posted', 0)
            .sum('b.qty as qty')
        return (row[0].qty == null) ? 0 : row[0].qty
    }

    /**
     * @param {string} user_id 
    */
    async fetch_pending_po(user_id) {
        let row = await Db.connection('receiving_new')
            .select('po_no', 'supplier_name', 'inv_no')
            .from('0_free')
            .where('posted', 0)
            .andWhere('user_id', user_id)
            .orderBy('supplier_name', 'asc')
        return row
    }

    /**
     * @param {int} user_id 
    */
    async fetch_po_items(order_no) {
        let row = await Db.connection('srs')
            .select('a.order_no', 'a.description', 'a.ord_qty', 'a.unit_id', 'a.stock_id', 'qty_scanned')
            .joinRaw(`FROM purch_order_details a LEFT JOIN 
                            (SELECT b.posted, c.qty as qty_scanned, c.prod_id FROM receiving_new.0_free b INNER JOIN receiving_new.0_free_details c 
                            ON b.id = c.temp_receiving_id WHERE po_id = ?) d
                            ON d.prod_id = a.stock_id`, [order_no])
            .where('order_no', order_no)
            .andWhere('trans_type', TRANS_TYPE)
            .groupBy('a.stock_id')
            .orderBy('description', 'ASC')
        return row
    }

    /**
     * count item temporary using lenght of array return value
     * @param {int} temp_id 
     * @param {string} po 
     */
    async counts_items(temp_id, po) {
        let row = await Db.select('temp_receiving_id')
            .joinRaw('FROM 0_free a INNER JOIN 0_free_details b ON a.id = b.temp_receiving_id')
            .where('a.po_no', po)
            .andWhere('temp_receiving_id', temp_id)
        return row.length
    }

    /**
    * delete header item
    * @param {int} temp_id 
    * @param {string} po 
    */
    async delete_header_items(temp_id, po) {
        let res = await Db.table('0_free')
            .where('po_no', po)
            .andWhere('id', temp_id)
            .delete()
        return res
    }

    /**
     * delete items receiving details
     * @param {int} id 
     */
    async delete_items(id) {
        let res = await Db.table('0_free_details')
            .where('id', id)
            .delete()
        return res
    }

    /**
     * @param {int} order_no 
     * @param {int} product_id 
     */
    async check_po_product_id(order_no, product_id) {
        let row = await Db.connection('srs')
            .select('*')
            .from('purch_order_details')
            .where('order_no', order_no)
            .andWhere('trans_type', TRANS_TYPE)
            .andWhere('stock_id', product_id)
        if (row.length == 0) {
            throw new CustomException({ message: `Item not in P.O ${product_id}` }, 401)
        }

        return row[0]
    }

    /**
     * @param {int} prod_id 
     * @param {int} order_no 
     */
    async CostOfSales(prod_id, order_no) {
        let row = await Db.connection('srs')
            .select('supplier_id')
            .from('purch_orders')
            .where('order_no', order_no)
            .andWhere('trans_type', TRANS_TYPE)
        if (row.length == 1) {
            let rows = await Db.connection('srspos')
                .select('averagenetcost')
                .from('vendor_products')
                .where('productid', prod_id)
                .andWhere('defa', 1)
                .andWhere('vendorcode', row[0].supplier_id)
            return (rows.length <= 0) ? 0 : rows[0].averagenetcost
        }
    }
    /**
     * @param {int} prod_id 
     * @param {int} order_no 
     * @param {int} qty 
     */
    async receive_qty(prod_id, order_no, qty) {
        let row = await Db.connection('receiving_new')
            .joinRaw('FROM 0_free a INNER JOIN 0_free_details b ON a.id = b.temp_receiving_id')
            .where('b.prod_id', prod_id)
            .andWhere('a.po_id', order_no)
            .sum('qty as qty')
        return (row[0].qty == null) ? parseFloat(qty) : parseFloat(row[0].qty) + parseFloat(qty)
    }

    /**
     * sum lahat ng total ng po na quantity
     * @param {int} prod_id 
     * @param {int} order_no 
     */
    async po_qty(prod_id, order_no) {
        let row = await Db.connection('srs')
            .from('purch_order_details')
            .where('order_no', order_no)
            .andWhere('trans_type', TRANS_TYPE)
            .andWhere('stock_id', prod_id)
            .sum('ord_qty as po_qty')
        return (row[0].po_qty == null) ? 0 : parseFloat(row[0].po_qty)
    }

    /**
    * checking kung exisiting yung barcode sa receiving details
    * @param {int} barcode 
    * @param {int} product_id 
    * @param {int} temp_id 
    */
    async check_barcode_receiving(barcode, product_id, temp_id) {
        let row = await Db.from('0_free_details')
            .where('temp_receiving_id', temp_id)
            .andWhere('prod_id', product_id)
            .andWhere('barcode', barcode)
        return row.length
    }
    /**
     * @param {int} order_no 
     */
    async get_supplier_info_po(order_no) {
        let row = await Db.connection('srs')
            .select('supplier_id', 'supplier_name')
            .from('purch_orders')
            .where('order_no', order_no)
            .andWhere('trans_type', TRANS_TYPE)
        await Db.close()
        return (row.length == 0) ? '' : row[0]
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
    /**
     * retyrn last id
     * @param {int} p_order_no 
     * @param {string} p_po 
     * @param {string} p_inv_no 
     * @param {int} user_id 
     */
    async add_receiving_header(order_no, po_no, inv_no, user_id) {
        let supplier = await this.get_supplier_info_po(order_no)
        let supplier_name = supplier.supplier_name
        let supplier_id = supplier.supplier_id

        let data = {
            po_id: order_no,
            po_no: po_no,
            supplier_id: supplier_id,
            supplier_name: supplier_name,
            inv_no: inv_no,
            date_: moment().format(TO_DATE),
            user_id: (isNaN(user_id) === false) ? user_id : user_id.toUpperCase(),
        }

        let result = await Db.insert(data)
            .into('0_free')
        return (result) ? result[0] : 0
    }

    /**
     * @param {int} p_temp_id 
     * @param {int} product_id 
     * @param {int} p_barcode 
     * @param {string} description 
     * @param {string} uom 
     * @param {int} qty 
     */
    async add_receiving_details(p_temp_id, product_id, p_barcode, description, uom, qty) {
        let data = {
            temp_receiving_id: p_temp_id,
            prod_id: product_id,
            barcode: p_barcode,
            item_name: description,
            uom: uom,
            qty: qty,
        }

        let result = await Db.insert(data)
            .into('0_free_details')
        return (result) ? true : false
    }

    async update_receiving_details(p_temp_id, product_id, p_barcode, qty) {
        let sql = `UPDATE 0_free_details SET qty = qty + ${parseFloat(qty)}
                    WHERE temp_receiving_id = ?
                    AND prod_id = ?
                    AND barcode = ? `
        let res = await Db.raw(sql, [p_temp_id, product_id, p_barcode])
        return (res) ? true : false
    }

    async add_product_history_auto_gained(srspos, product, barcode, movement_line_id, ig_counter, user_id) {
        let quantity = product.sellingarea
        let description = 'AUTO INVENTORY GAIN'

        let data = {
            productid: product.productid.toString(),
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
            CANCELLED: 0,
            CANCELLEDBY: '',
            BeginningDamaged: null,
            FlowDamaged: null
        }

        await srspos.insert(data)
            .into('producthistory')
        return true
    }

    async fetch_po_order(order_no) {
        let row = await Db.connection('srs')
            .select('a.*', 'b.reference')
            .joinRaw('FROM purch_orders a INNER JOIN refs b ON a.trans_type = b.trans_type AND a.order_no = b.trans_id')
            .where('br_code', BRANCH_CODE)
            .andWhere('a.order_no', order_no)
            .andWhere('a.br_code', BRANCH_CODE)
            .andWhere('a.status', 0)
            .andWhere('a.trans_type', TRANS_TYPE)
        return (row.length == 0) ? 0 : row[0]
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
        let extended = parseFloat(products.sellingarea) * Math.abs(qty) + 0
        let description = products.description

        let data = {
            MovementID: receiving_movement_id,
            ProductID: temporary_items.prod_id,
            ProductCode: products.productcode,
            Description: description.replace(/'/g, ""),
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



    /**
    * 
    * @param {string} po_no 
    * @param {int} temp_id 
    * @param {int} user_id 
    */

    async fetch_receiving_po(po_no, temp_id, user_id) {
        let row = await Db.select('id', 'supplier_id')
            .from('0_free')
            .where('po_no', po_no)
            .andWhere('user_id', user_id)
            .andWhere('id', temp_id)
        return (row.length == 0) ? 0 : row[0]
    }

    /**
    * @param {int} temp_id 
    */
    async fetch_receiving_product_id(temp_id) {
        let row = await Db.select('prod_id')
            .from('0_free_details')
            .where('temp_receiving_id', temp_id)
        return (row.length == 0) ? 0 : row
    }

    async post_auto_gained(srspos, srs_receiving, receiving, temp_id, remarks, inv_no, user_id, selling_area_negative) {
        let movement_code = 'AIG'
        let aig_counter = await PosMod.fetch_counter(srspos, movement_code)
        let ig_counter = leftPad(aig_counter, 10, 0)
        let po_id = receiving.po_id
        let po_no = receiving.po_no
        let supplier_id = receiving.supplier_id
        let company = await PosMod.get_company()

        let receiving_movement_id = await this.add_receiving_movement(ig_counter, company, supplier_id, user_id, movement_code, srspos)

        let qty = 0
        let extended = 0

        for (const productid of selling_area_negative) {
            let products = await PosMod.fetch_products(srspos, productid)
            if (products.sellingarea >= 0) {
                await srspos.rollback()
                await srs_receiving.rollback()
                throw new CustomException({ message: `Product id is not negative ${productid}` }, 401)
            }

            let temporary_items = await this.fetch_temporary_product_id_items(temp_id, productid)

            let barcode = temporary_items.barcode
            let pos_prod = await PosMod.fetch_pos_product({ barcode }, 'qty')
            let pack = parseFloat(pos_prod[0].qty) / parseFloat(pos_prod[0].qty)
            let qty_s = parseFloat(products.sellingarea)

            qty = qty + Math.abs(parseFloat(products.sellingarea))
            let extended_s = parseFloat(extended + Math.round(parseFloat(products.costofsales) * Math.abs(qty_s)))
            extended = extended_s.toFixed(4)

            let movement_line_id = await this.add_receiving_movement_line(receiving_movement_id, temporary_items, products, qty_s, pack, barcode, srspos)

            await this.add_product_history_auto_gained(srspos, products, barcode, movement_line_id, ig_counter, user_id)
            await this.update_products_gained_qty(srspos, productid)
        } // end loop negative

        await this.update_movement_ms(srspos, extended, qty, receiving_movement_id)
        return receiving_movement_id
    }

    /**
     * 
     * @param {oject} srspos //rollback object
     * @param {int} user_id 
     * @param {int} receiving_counter 
     * @param {string} po_no 
     * @param {string} inv_no 
     * @param {int} inv_amount 
     * @param {int} po_order 
     * @param {string} supplier_id 
     * @param {string} remarks 
     */
    async add_receiving_ms(srspos, user_id, receiving_counter, po_no, inv_no, inv_amount, po_order, supplier_id, remarks) {
        let termid_id = await PosMod.fetch_vendor_termid_id(srspos, supplier_id)
        let location = 1
        let status = 2
        let delivery_des = "SAN ROQUE SUPERMARKET RETAIL SYSTEMS, INC."
        let delivery_date = moment(po_order.delivery_date).format(TO_DATE)
        let record_date = moment().format('YYYY-MM-DD HH:mm:ss.SSS')
        let trans_date = moment(po_order.trans_date).add(30, 'days').format('YYYY-MM-DD')
        let data = {
            receivingno: receiving_counter,
            purchaseorderid: '0',
            purchaseorderno: po_no,
            remarks: inv_no,
            vendorcode: supplier_id,
            description: po_order.supplier_name.replace(/'/g, ""),
            address: po_order.delivery_address.replace(/'/g, "").slice(0, 100),
            contactperson: '',
            EDA: delivery_date,
            cancellationdate: trans_date,
            terms: termid_id,
            deliverto: location,
            deliverydescription: delivery_des,
            deliveryaddress: po_order.delivery_address.replace(/'/g, "").slice(0, 100),
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
            subtotal: po_order.net_total.toString(),
            nettotal: po_order.net_total.toString(),
            statusdescription: 'POSTED',
            otherexpenses: '0',
            forexrate: '1',
            forexcurrency: 'PHP',
            discount1: '0',
            discount2: '0',
            discount3: '0',
            datacollectorcontrolno: '0',
            requestforpaymentstatus: 'NULL',

        }
        // console.log(data)
        await srspos.table('ROF').insert(data)
        //.on('query', console.log)

        let row = await srspos.raw(`SELECT IDENT_CURRENT('ROF') as last_id`)
        return row[0].last_id
    }

    /**
    * @param {int} order_no 
    * @param {int} prod_id 
    */
    async fetch_po_line_details(order_no, prod_id) {
        let row = await Db.connection('srs')
            .select('*')
            .from('purch_order_details')
            .where('order_no', order_no)
            .andWhere('trans_type', TRANS_TYPE)
            .andWhere('stock_id', prod_id)
        return (row.length == 0) ? 0 : row[0]
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

    async add_receiving_line_ms(products, po_line, amount, product_id, barcode, qty, uom, receiving_id, srspos) {
        let disc_value1 = (amount.disc_value1 == 0) ? '0' : roundPrecision(amount.disc_value1, 2)
        let disc_value2 = (amount.disc_value2 == 0) ? '0' : roundPrecision(amount.disc_value1, 2)
        let disc_value3 = (amount.disc_value3 == 0) ? '0' : roundPrecision(amount.disc_value1, 2)
        let description = products.description

        let vatable = (Number(products.pvatable) == 1) ? (amount.extended_price - (amount.extended_price / (1 + Number(products.pvatable) / 100))) : 0
        let data = {
            receivingid: receiving_id.toString(),
            vendorproductcode: '',
            productid: product_id.toString(),
            productcode: products.productcode,
            description: description.replace(/'/g, ""),
            uom: uom,
            unitcost: po_line.unit_price.toString(),
            qty: qty.toString(),
            netunitcost: '0',
            extended: '0',
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

        await srspos.insert(data).into('ROFLine')
        let row = await srspos.raw(`SELECT IDENT_CURRENT('ROFLine') as last_id`)
        return row[0].last_id
    }

    async add_product_history_receiving(srspos, product, barcode, receiving_id, receiving_counter, selling_area_qty, pack, qty, po_line, user_id) {
        let quantity = (pack * qty)
        let description = 'RECEIVED FREE'

        let data = {
            productid: product.productid.toString(),
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
            unitcost: po_line.unit_price.toString(),
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
            CANCELLED: 0,
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
     * @param {int} temp_id 
     * @param {int} prod_id 
        */
    async fetch_temporary_product_id_items(temp_id, prod_id) {
        let row = await Db.connection('receiving_new')
            .from('0_free_details')
            .where('temp_receiving_id', temp_id)
            .andWhere('prod_id', prod_id)
        return row[0]
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
            movementno: ig_counter.toString(),
            movementcode: movement_code,
            referenceno: '',
            sourceinvoiceno: '',
            sourcedrno: '',
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
     * @param {int} inv_amount default to 0
     * @param {int} recounter 
     * @param {string} inv_no 
     * @param {int} temp_id 
     * @param {object} srs_receiving rolbback mysql
     */
    async update_receiving(inv_amount, recounter, inv_no, temp_id, srs_receiving) {
        let data = {
            posted: 1,
            date_: moment().format('YYYY-MM-DD'),
            inv_no: inv_no
        }
        await srs_receiving.table('0_free')
            .where('id', temp_id)
            .update(data)
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

    async update_movement_ms(srspos, extended, qty, receiving_movement_id) {
        let data = {
            NetTotal: extended.toString(),
            totalqty: qty.toString()
        }
        await srspos.table('movements')
            .where('movementid', receiving_movement_id)
            .update(data)
    }

    async add_product_history_auto_loss(srspos, product, barcode, gain_qty, lost_movement_id, il_counter, user_id) {
        let quantity = product.sellingarea
        let description = 'AUTO INVENTORY LOSS'

        let data = {
            productid: product.productid.toString(),
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
            CANCELLED: 0,
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
        let ail_counter = await PosMod.fetch_counter(srspos, 'AIL')
        let il_counter = leftPad(ail_counter, 10, 0)
        let po_id = receiving.po_id
        let po_no = receiving.po_no
        let supplier_id = receiving.supplier_id
        let company = await PosMod.get_company()

        let lost_movement_id = await this.add_receiving_movement(il_counter, company, supplier_id, user_id, movement_code, srspos)

        let qty = 0
        let extended = 0

        for (const productid of selling_area_negative) {
            let products = await PosMod.fetch_products(srspos, productid)
            let temporary_items = await this.fetch_temporary_product_id_items(temp_id, productid)
            let barcode = temporary_items.barcode
            let pos_prod = await PosMod.fetch_pos_product({ barcode }, 'qty')

            let gain_qty = await this.fetch_gain_qty(srspos, srs_receiving, receiving_movement_id, productid)
            let pack = pos_prod[0].qty / pos_prod[0].qty
            let qty_s = gain_qty * pack

            qty = qty + Math.abs(parseFloat(gain_qty))
            let extended_s = parseFloat(extended + Math.round(parseFloat(products.costofsales) * Math.abs(qty_s)))
            extended = extended_s.toFixed(4)

            await this.add_receiving_movement_line(lost_movement_id, temporary_items, products, qty_s, pack, barcode, srspos)
            await this.add_product_history_auto_loss(srspos, products, barcode, gain_qty, lost_movement_id, il_counter, user_id)

            let update_qty = products.sellingarea - gain_qty
            await this.update_products_loss_qty(srspos, productid, update_qty)
        } // end loop negative

        await this.update_movement_ms(srspos, extended, qty, lost_movement_id)
    }

    async post_receiving(temp_id, inv_no, remarks, po_no, branch_code, user_id, selling_area_negative = null) {
        let srspos = await Db.connection('srspos').beginTransaction()
        let srs_receiving = await Db.connection().beginTransaction()

        try {

            let receiving = await this.fetch_receiving(po_no)
            if (receiving == 0) {
                throw new CustomException({ message: `Ang P.O na to ay posted na` }, 401)
            }

            //AUTO GAINED
            let receiving_movement_id = 0
            if (selling_area_negative != null) {
                receiving_movement_id = await this.post_auto_gained(srspos, srs_receiving, receiving, temp_id, remarks, inv_no, user_id, selling_area_negative)
            }

            //RECEIVINGa
            let dis = ""
            let amount = ""
            let rr_sub_total = 0
            let rr_net_total = 0
            let recounter = await PosMod.fetch_counter(srspos, 'ROF')
            let receiving_counter = leftPad(recounter, 10, 0)
            let po_id = receiving.po_id
            let supplier_id = receiving.supplier_id
            let inv_amount = 0
            let po_order = await this.fetch_po_order(po_id)

            let receiving_id = await this.add_receiving_ms(srspos, user_id, receiving_counter, po_no, inv_no, inv_amount, po_order, supplier_id, remarks)
            let temporary_items = await this.fetch_temporary_items(temp_id)

            for (const row of temporary_items) {
                let product_id = row.prod_id
                let barcode = row.barcode
                let qty = row.qty
                let uom = row.uom

                let products = await PosMod.fetch_products(srspos, product_id)
                if (products == "") {
                    await srspos.rollback()
                    throw new CustomException({ message: `No item fetch in Products ${product_id}` }, 401)
                }

                let po_line = await this.fetch_po_line_details(po_id, product_id)
                let pos_prod = await PosMod.fetch_pos_product({ barcode }, 'qty')

                let pack = pos_prod[0].qty
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

                let discs = po_line.discounts
                let count = 0
                let deduc = 0

                let extended_price = .0000
                let split_disc = (discs != "") ? discs.split(',') : []



                // rr_sub_total  += (extended_price * qty)
                // extended_price = extended_price * qty
                // rr_net_total  += roundPrecision(extended_price, 4)

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
                await this.add_receiving_line_ms(products, po_line, amount_obj, product_id, barcode, qty, uom, receiving_id, srspos)
                //await this.add_receive_products_ms(products, qty, pack, receiving_id, srspos)

                let selling_area_qty = await PosMod.fetch_selling_area_product(srspos, product_id)
                let product_history = await this.add_product_history_receiving(srspos, products, barcode, receiving_id, receiving_counter, selling_area_qty, pack, qty, po_line, user_id)

                let old_stock = parseFloat(products.sellingarea)
                let old_stock_cost = parseFloat(old_stock) * parseFloat(products.costofsales)
                let new_cost = products.costofsales

                if (old_stock + total_qty_purchase != 0) {
                    let old_stock_cost_extended = parseFloat(old_stock_cost) + parseFloat(extended_price)
                    new_cost = roundPrecision(parseFloat(old_stock_cost_extended / (old_stock + total_qty_purchase)), 4)
                }

                let total_new_cost = new_cost + 0
                await this.update_products_cost(total_new_cost, selling_area_qty, qty, pack, product_id, srspos)
            } // end loop products po

            //await this.update_receiving_sub_total(rr_sub_total, rr_net_total, receiving_id, srspos)
            await this.update_receiving(inv_amount, recounter, inv_no, temp_id, srs_receiving)

            //AUTO INVENTORY LOSS
            if (selling_area_negative != null) {
                await this.post_auto_loss(srspos, srs_receiving, receiving, temp_id, remarks, inv_no, user_id, receiving_movement_id, selling_area_negative)
            }
            // throw new Error('error')
            //if no error commit the transaction 
            await srs_receiving.commit()
            await srspos.commit()
            return recounter

        } catch (error) {
            console.log(error.toString())
            console.log(error)
            await srspos.rollback()
            await srs_receiving.rollback()
            return false
        }
    }

    async fetch_pending_po(user_id) {
        let row = await Db.connection()
            .select('*')
            .from('0_free')
            .where('user_id', user_id)
            .andWhere('posted', 0)
        return row
    }

}

module.exports = new ReceivePoFree
