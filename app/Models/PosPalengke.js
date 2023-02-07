'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const Db = use('Database')
const Env = use('Env')
const br_code = Env.get('BRANCH_CODE', '')
const CustomException = use('App/Exceptions/CustomException')
const _ = require('lodash')
const moment = require('moment')

class PosProduct extends Model {

    /**
     * reusable function pos_products table
     * @param {object, json} where
     * @param {string} select 
     */
    async fetch_pos_product(where, select="*", trx=null) {

        let column = []
        let value  = []
        let count  = 0
        _.each(where, function(values, fields) {
            column.push(fields + " = ?") //sample output column ['barcode = ?', 'product_id = ? ']
            value.push(values.toString())  //sample output value where ['2303230230', '12312312']
        })
        
        let field = column.toString().replace(/,/g," AND ")

        if(trx == null) {
            let row = await Db.connection('srspos_palengke')
                              .raw(`SELECT ${select} FROM dbo.pos_products WHERE ${field}`, value)
            return (row.length > 1) ? -1 : row
        }

        let row = await trx.raw(`SELECT ${select} FROM pos_products WHERE ${field}`, value)
        return (row.length > 1) ? -1 : row
    }

    /**
     * reusable function pos_products table
     * @param {object, json} where
     * @param {string} select 
     */
    async fetch_pos_product_branch(where, select="*", br_code) {

      let column = []
      let value  = []
      let count  = 0

      _.each(where, function(values, fields) {
          column.push(fields + " = ?") //sample output column ['barcode = ?', 'product_id = ? ']
          value.push(values.toString())  //sample output value where ['2303230230', '12312312']
      })
      
      let field = column.toString().replace(/,/g," AND ")

      let row = await Db.connection(br_code+'ms')
                        .raw(`SELECT ${select} FROM pos_products WHERE ${field}`, value)
      return (row.length > 1) ? -1 : row  
    }

    async fetch_pos_products(where, select="*", trx=null) {

        let column = []
        let value  = []
        let count  = 0
        _.each(where, function(values, fields) {
            column.push(fields + " = ?") //sample output column ['barcode = ?', 'product_id = ? ']
            value.push(values.toString())  //sample output value where ['2303230230', '12312312']
        })
        
        let field = column.toString().replace(/,/g," AND ")

        if(trx == null) {
            let row = await Db.connection('srspos_palengke')
                              .raw(`SELECT ${select} FROM pos_products WHERE ${field}`, value)
            return (row.length == 0) ?  0 : row
        }
        let row = await trx.raw(`SELECT ${select} FROM pos_products WHERE ${field}`, value)
        return (row.length == 0) ?  0 : row
    }

    async fetch_pos_srp_gulay(barcode, br_code='srsn') {
      let sql = `SELECT TOP 1 a.description, srp, a.barcode FROM pos_products a 
      INNER JOIN products b ON a.productid = b.productid
      WHERE barcode = ? AND levelfield1code = 10061 AND levelfield2code = ''`
      let row = await Db.connection(br_code+'ms').raw(sql, [barcode])
      Db.close()
      return (row.length == 0) ?  0 : row[0]
    }

    async fetch_pos_gulay_list(br_code='srsn') {
      let sql = `SELECT a.description, srp, a.barcode, b.levelfield1code, b.levelfield2code FROM pos_products a 
      INNER JOIN products b ON a.productid = b.productid
      WHERE UOM = 'KG' `
      // WHERE levelfield1code = '10061' AND levelfield2code = ''`
      let row = await Db.connection(br_code+'ms').raw(sql)
      Db.close()
      return (row.length == 0) ?  0 : row
    }

    /**
     * reusable function products where in table
     * @param {array} where []
    */
    async fetch_product_in(where) {
        let row = await Db.connection('srspos_palengke')
                          .select('sellingarea','productid', 'costofsales')
                          .from('products')
                          .whereIn('productid', where)
        return (row.length == 0 ) ? 0: row
    }

     /**
     * reusable function counter table
     * @param {object} trx rollback object
     * @param {string} counter_type 
     */
    async fetch_counter(trx, counter_type) {
        let row = await trx.select('counter')
                           .from('counters')
                           .where('transactiontypecode', counter_type)
        if (row.length == 0) {
            await trx.rollback()
            throw new CustomException({ message: `transactiontypecode is invalid (${counter_type})` }, 401)
        }
        let counter = row[0].counter + 1
        let res     = await trx.table('counters')
                           .where('transactiontypecode', counter_type)
                           .update({ counter })
        return counter
    }

    /**
     * reusable function counter table
     * @param {object} trx rollback object
     * @param {string} vendorcode 
     */
    async fetch_vendor_termid_id(trx, vendorcode) {
        let row = await trx.select('termid')
                           .from('vendor')
                           .where('vendorcode', vendorcode)
        return (row.length == 0) ? '' : row[0].termid
    }

    /**
     * reusable function products table
     * @param {object} trx rollback object rollback is off if null
     * @param {string} vendorcode 
     */
    async fetch_products(trx=null, productid) {
        if (trx != null) {
            let row = await trx.select('productid','productcode','description', 'fieldacode','fieldbcode','fieldccode','fielddcode','fieldecode',
            'levelfield1code', 'levelfield2code', 'levelfield3code', 'fieldstylecode', 'reportuom', 'reportqty', 'expirable',
            'withlotno', 'withserialno', 'sellingarea','stockroom', 'damaged', 'pvatable', 'pvatpercent', 'costofsales','globalid')
                               .from('products')
                               .where('productid', productid)
            return (row.length == 0) ? '' : row[0]
        } else {
            let row = await Db.connection('srspos_palengke')
                              .select('productid','productcode','description', 'fieldacode','fieldbcode','fieldccode','fielddcode','fieldecode',
                              'levelfield1code', 'levelfield2code', 'levelfield3code', 'fieldstylecode', 'reportuom', 'reportqty', 'expirable',
                              'withlotno', 'withserialno', 'sellingarea','stockroom', 'damaged', 'pvatable', 'pvatpercent', 'costofsales','globalid')
                              .from('products')
                              .where('productid', productid)
                              await Db.close(['srspos_palengke'])
            return (row.length == 0) ? '' : row[0]
        }
    }
    
    /**
     * @param {string} discode 
     */
    async fetch_discount_details(discode) {
        let row = await Db.connection('srspos_palengke')
                              .select('amount', 'percent', 'plus')
                              .from('discounts')
                              .where('discountcode', discode)
                              await Db.close(['srspos_palengke'])
        return (row.length == 0) ? {Amount:0, Percent: 0, Plus: 0} : row[0]
    }

    /**
     * @param {object} trx //activate rollback query if not null
     * @param {int} product_id 
     */
    async fetch_selling_area_product(trx=null, product_id) {
        if (trx != null) {
            let row = await trx.select('sellingarea')
                               .from('products')
                               .where('productid', product_id)
            return (row.length == 0) ? 0 : row[0].sellingarea
        }
 
        let row = await Db.connection('srspos_palengke')
                            .select('sellingarea')
                            .from('discounts')
                            .where('discountcode', discode)
                            await Db.close(['srspos_palengke'])
        return (row.length == 0) ? 0 : row[0].sellingarea
    }

    /**
     * 
     * @param {int} coycode 
     */
    async get_company(coycode=1) {
        let row = await Db.connection()
                            .select('coy_name')
                            .from('0_company')
                            .where('coy_code', coycode)
                            await Db.close()
        return (row.length == 0) ? '' : row[0].coy_name
    }
    /**
     * @param {object} trx rollback
     * @param {int} coycode 
     */
    async fetch_movement_types(trx, movement_code) {
        let row = await trx.select('description')
                           .from('MovementTypes')
                           .where('MovementCode', movement_code)

        await Db.close()
        return (row.length == 0) ? '' : row[0]
    }

    async fetch_list_uom() {
        let row = await Db.connection('srspos_palengke')
                           .select('uom as a1', 'uom as a2')
                           .from('uom')
        await Db.close()
        return row
    }
    /**
     * @param {int} product_id 
     * @param {string} vendor_code 
     */
    async fetch_vendor_product(product_id, vendor_code) {
        let row = await Db.connection('srspos_palengke')
                           .select('productid', 'vendorproductcode', 'description', 'uom', 'totalcost', 'cost')
                           .from('vendor_products')
                           .where('vendorcode', vendor_code)
                           .andWhere('productid', product_id)
                           .orderBy('description', 'asc')
        await Db.close()
        return (row.length == 0) ? 0 : row[0]
    }
    /**
     * reusable function counter table
     * @param {object} trx rollback object
     * @param {string} vendorcode 
     */
    async fetch_vendor_name(vendorcode) {
        let row = await Db.connection('srspos_palengke')
                          .select('description')
                          .from('vendor')
                          .where('vendorcode', vendorcode)
        await Db.close()
        return (row.length == 0) ? '' : row[0].description
    }
    /**
     * reusable function counter table
     * @param {object} trx rollback object
     * @param {string} vendorcode 
     */
    async fetch_vendor(vendorcode) {
        let row = await Db.connection('srspos_palengke')
                          .select('*')
                          .from('vendor')
                          .where('vendorcode', vendorcode)
        await Db.close()
        return (row.length == 0) ? '' : row[0]
    }
    /**
       * reusable function counter table
       * @param {object} trx rollback object
       * @param {string} vendorcode 
       */
      async fetch_name(userid) {
        let row = await Db.connection('srspos_palengke')
                          .select('name')
                          .from('markusers')
                          .where('userid', userid)
        await Db.close()
        return (row.length == 0) ? '' : row[0].name
    }
    /**
     * reusable function counter table
     * @param {string} uom rollback object
     */
    async fetch_uom_qty(uom) {
        let row = await Db.connection('srspos_palengke')
                          .select('qty')
                          .from('uom')
                          .where('uom', uom)
        await Db.close()
        return (row.length == 0) ? '' : row[0].qty
    }
    /**
     * @param {string} supplier_id 
     * @param {int} product_id 
     */
    async fetch_vendor_product_discount(supplier_id, product_id){
        let row = await Db.connection('srspos_palengke')
                          .select('discountcode1', 'discountcode2', 'discountcode3', 'discount1', 'discount2', 'discount3')
                          .from('vendor_products')
                          .where('vendorcode', supplier_id)
                          .andWhere('productid', product_id)
        await Db.close()
        return (row.length == 0) ? '' : row[0]
    }

    async auth(username, password) {
        let row = await Db.connection('srspos_palengke')
                          .select('loginid', 'name', 'password', 'userid', 'level')
                          .from('markusers')
                          .where('loginid', username)
                          .andWhere('password', password)
        await Db.close()
        return (row.length == 0) ? '' : row[0]
    }

    async add_file_attachment(p_po, file_name, file_type, file_sub_type, user_id, file_img_name=null) {
        let data = {
            tfile_no: p_po,
            tfile_name: file_name,
            tfile_type: file_type,
            tfile_img_name: file_img_name,
            tfile_sub_type: file_sub_type,
            tdate_uploaded: moment().format('YYYY-MM-DD'),
            tuser_id: user_id
        }

        await Db.insert(data)
                .into('0_file_attachment')

        await Db.close()
    }

    async check_gi() {
      return await Db.connection('inventory_fix_cp').from('0_gi_status')
        .where('date', moment().format('YYYY-MM-DD'))
        .andWhere('status', 0)
    }
}

module.exports = new PosProduct
