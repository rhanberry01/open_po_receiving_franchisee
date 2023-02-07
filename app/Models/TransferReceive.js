'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const Db = use('Database')
const Env = use('Env')
const BRANCH_CODE = Env.get('BRANCH_CODE', '')
const CustomException = use('App/Exceptions/CustomException')
const PosMod      = use('App/Models/Pos')
const OpenPoVariableMod       = use('App/Models/OpenPoVariable')


const moment = require('moment')
const leftPad = require('left-pad')
const TO_DATE = Env.get('TO_DATE')
const PAGE_LIMIT = Env.get('PAGE_LIMIT', 10)

class TransferReceive extends Model {

    /**
     * @param {int} page 
     * @param {int} transfer_no 
     */
    async fetch_receive_transfer(page, transfer_no) {
        let row = await Db.connection('transfers')
                          .select('a.id', 'a.delivery_date', 'b.name as branch_in', 'c.name as branch_out', 'a.transfer_out_date','a.m_no_out')
                          .joinRaw('FROM 0_transfer_header a INNER JOIN 0_branches b ON a.br_code_in = b.code INNER JOIN 0_branches c ON a.br_code_out = c.code')
                          .where('br_code_in', BRANCH_CODE)
                          .andWhere('aria_trans_no_out',  "!=", 0)
                          .andWhere('aria_type_out', "!=", 0)
                          .andWhere('aria_trans_no_in', 0)
                          .andWhere('aria_type_in', 0)
                          .andWhere('cancelled', 0)
                          .whereNotNull('br_code_in')
                          .whereRaw(`a.id LIKE ?`, [(transfer_no == null) ? '' :  `%${transfer_no}%`])
                          .orderBy('a.delivery_date', 'desc')
                          .paginate(page, PAGE_LIMIT)
                         // .debug(true)
                          
        return [row.data, row.lastPage]
    }

    /**
     * @param {int} p_transfer_no 
     */
    async fetch_receive_transfer_details(p_transfer_no) {
        let row = await Db.connection('transfers')
                          .select('a.delivery_date', 'a.date_created', 'a.requested_by', 'b.name as br_code_out', 'c.name as br_code_in')
                          .joinRaw('FROM 0_transfer_header a INNER JOIN 0_branches b ON a.br_code_out = b.code INNER JOIN 0_branches c ON a.br_code_in = c.code')
                          .where('a.id', p_transfer_no)
        return row[0]
    }
    /**
     * @param {int} p_transfer_no 
     */
    async fetch_receive_transfer_details_temp(p_transfer_no) {
        let row = await Db.connection('transfers')
                          .select('*')
                          .from('0_transfer_details')
                          .where('transfer_id', p_transfer_no)
        return row
    }

    async checkProductId(productid, transfer_no,p_barcode) {
      let row = await Db.connection('transfers')
                        .joinRaw('FROM 0_transfer_header a INNER JOIN 0_transfer_details b ON a.id = b.transfer_id')
                        .where('b.transfer_id', transfer_no)
                        .andWhere('b.stock_id_2', productid)
                        .andWhere('b.barcode', p_barcode)
      return (row.length > 0) ? row[0] : false
    }
    
    /* async fetchTransferDetails(transfer_no) {
        let row = await Db.connection('transfers')
                          .joinRaw('FROM 0_transfer_header a INNER JOIN 0_transfer_details b ON a.id = b.transfer_id')
                          .where('b.transfer_id', transfer_no)
        return (row.length > 0) ? row[0] : false
      }
 */
    
  /**
     * @param {int} p_transfer_no 
     */
   async fetchTransferDetails(p_transfer_no){
    let row = await Db.connection('transfers')
                      .select('*')
                      .joinRaw('FROM 0_transfer_header a INNER JOIN 0_transfer_details b ON a.id = b.transfer_id')
                      .andWhere('a.id', p_transfer_no)
    return row
}
    async updateProductIdTransfer(transfer_no, productid, barcode, uom) {
      return await Db.connection('transfers').table('0_transfer_details')
              .where('transfer_id', transfer_no)
              .andWhere('barcode', barcode)
              .andWhere('uom', uom)
              .update({ stock_id_2: productid }) 
    }

    /**
     * @param {int} p_transfer_no 
     */
    async fetch_transfer_header(p_transfer_no){
        let row = await Db.connection('transfers')
                          .select('*', 'b.name as br_code_out', 'c.name as br_code_in', 'b.code as branch_out', 'b.code as branch_in')
                          .joinRaw('FROM 0_transfer_header a INNER JOIN 0_branches b ON a.br_code_out = b.code INNER JOIN 0_branches c ON a.br_code_in = c.code')
                          .where('a.br_code_in', BRANCH_CODE)
                          .andWhere('a.id', p_transfer_no)
                          .andWhere('cancelled', 0)
        return (row.length == 0) ? 0 : row[0]
    }
    /**
     * @param {int} p_transfer_no 
    */
    async fetch_receive_header(p_transfer_no) {
        let row = await Db.connection()
                          .select('*')
                          .from('0_receive_transfer')
                          .where('posted', 0)
                          .andWhere('transfer_id', p_transfer_no)
        return (row.length == 0) ? 0 : row[0]
    }
    /**
     * @param {int} productid 
     * @param {int} p_transfer_no 
     * @param {int} qty 
     */
    async qty_receive(productid, p_transfer_no, qty) {
        let row = await Db.joinRaw('FROM 0_receive_transfer a INNER JOIN 0_receive_transfer_details b ON a.id = b.temp_receiving_id')
                          .where('transfer_id', p_transfer_no)
                          .andWhere('b.prod_id', productid)
                          .sum('qty as total')
        return (row[0].total == null) ? 0  + parseFloat(qty) : parseFloat(row[0].total) + parseFloat(qty) 
    }
    /**
     * @param {int} p_transfer_no 
     * @param {int} productid 
     */
    async qty_receive_item(p_transfer_no, productid){
        let row = await Db.connection('transfers')
                          .from('0_transfer_details')
                          .where('transfer_id', p_transfer_no)
                          .andWhere('stock_id_2', productid)
                          .sum('actual_qty_out as total')
        return (row[0].total == null) ? 0 : parseFloat(row[0].total)
    }
     /**
     * @param {int} p_transfer_no 
     * @param {int} barcode 
     */
      async check_qty_receive_item(p_transfer_no){
        let row = await Db.connection('transfers')
                          .from('0_transfer_details')
                          .where('transfer_id', p_transfer_no)
                          .sum('actual_qty_out as total')
        return (row[0].total == null) ? 0 : parseFloat(row[0].total)
      }
    /**
     * 
     * @param {int} transfer_no 
     * @param {string} location_from 
     * @param {int} user_id 
     */
    async add_receive_transfer_header(trx, transfer_no, location_from, user_id) {
        let data   = {
            transfer_id: transfer_no,
            location_from: location_from,
            date_: moment().format(TO_DATE),
            user_id: user_id
        }
        let result = await trx.insert(data)
                              .into('0_receive_transfer')
        return result[0]
    }
    /**
     * @param {int} productid 
     * @param {int} barcode 
     * @param {int} temp_id 
     */
    async fetch_receive_transfer_items(productid, barcode, temp_id){
        let row = await Db.from('0_receive_transfer_details')
                          .where('temp_receiving_id', temp_id)
                          .andWhere('barcode', barcode)
                          .andWhere('prod_id', productid)
        return (row.length == 0) ? 0 : row[0]
    }
    /**
     * @param {object} trx 
     * @param {int} temp_id 
     * @param {int} productid 
     * @param {int} barcode 
     * @param {string} description 
     * @param {string} uom 
     * @param {float} qty 
     * @param {int} current_inv 
     */
    async add_receive_transfer_details(trx, temp_id, productid, barcode, description, uom, qty, current_inv){
        let data   = {
            temp_receiving_id: temp_id,
            prod_id: productid,
            barcode: barcode,
            item_name: description,
            uom: uom,
            qty: qty,
            current_inventory: current_inv
        }
        await trx.insert(data)
                 .into('0_receive_transfer_details')       
    }

    async update_transfer_posted(transfer_id) {
      await Db.table('0_receive_transfer')
              .where('transfer_id', transfer_id)
              .update({ posted: 1 }) 
    }

    /**
     * @param {int} temp_id 
     * @param {int} productid 
     * @param {int} barcode 
     * @param {int} qty 
     */
    async update_receive_transfer_details(trx, temp_id, productid, barcode, qty) {
        await trx.table('0_receive_transfer_details')
                 .where('temp_receiving_id', temp_id)
                 .andWhere('prod_id', productid)
                 .andWhere('barcode', barcode)
                 .update({ qty }) 
    }

    /**
     * @param {object} pos_product 
     * @param {int} barcode 
     * @param {int} qty 
     * @param {string} location_from 
     * @param {int} transfer_no 
     * @param {int} user_id 
     * @param {string} current_inv 
     * @param {int} temp_id 
     */
    async add_receive_transfer(pos_product, barcode, qty, location_from, transfer_no, user_id, current_inv, temp_id) {
        let trx = await Db.connection().beginTransaction()
        
        let productid   = pos_product[0].productid
        let description = pos_product[0].description
        let uom         = pos_product[0].uom
        if (temp_id == "") {
            temp_id = await this.add_receive_transfer_header(trx, transfer_no, location_from, user_id)
        }

        let dispatch_transfer_items = await this.fetch_receive_transfer_items(productid, barcode, temp_id)
        if (dispatch_transfer_items == 0) {
            await this.add_receive_transfer_details(trx, temp_id, productid, barcode, description, uom, qty, current_inv)
        } else {
            qty = parseFloat(dispatch_transfer_items.qty) + parseFloat(qty)
            await this.update_receive_transfer_details(trx, temp_id, productid, barcode, qty)
        }

        trx.commit()
        await this.update_last_item_scanned(barcode, productid, temp_id)
        return temp_id
    }

    async update_last_item_scanned(barcode, prod_id, temp_receiving_id) {
        await Db.connection('receiving_new')
                .table('0_receive_transfer_details')
                .andWhere('temp_receiving_id', temp_receiving_id)
                .update({ status: 0 })

        await Db.connection('receiving_new')
                .table('0_receive_transfer_details')
                .where('barcode', barcode)
                .andWhere('prod_id', prod_id)
                .andWhere('temp_receiving_id', temp_receiving_id)
                .update({ status: 1 })
    }

    async fetch_last_item_scanned(temp_receiving_id) {
        let row = await Db.connection('receiving_new')
                          .select('item_name', 'qty', 'uom', 'prod_id')
                          .from('0_receive_transfer_details')
                          .where('temp_receiving_id', temp_receiving_id)
                          .andWhere('status', 1)
       return (row.length == 0) ? 0 : row[0]
    }
    /**
     * sum lahat ng quantity na receive na sa dispatch details na item
     * @param {int} temp_id 
     */
    async sum_receive_total_qty_receive(temp_id) {
        let row = await Db.joinRaw('FROM 0_receive_transfer a INNER JOIN 0_receive_transfer_details b ON a.id = b.temp_receiving_id')
                          .where('a.posted', 1)
                          .andWhere('a.id', temp_id)
                          .sum('qty as qty')
        return (row[0].qty == null) ? 0 : row[0].qty
    }
    /**
     * @param {int} transfer_id 
     */
    async sum_total_qty_receive(transfer_id) {
        let row = await Db.connection('transfers')
                          .from('0_transfer_details')
                          .andWhere('transfer_id', transfer_id)
                          .sum('qty_out as qty')
        return (row[0].qty == null) ? 0 : row[0].qty
    }
    /**
     * @param {int} temp_id 
    */
    async fetch_temporary_items_receive(temp_id) {
        let row = await Db.connection()
                          .from('0_receive_transfer_details')
                          .where('temp_receiving_id', temp_id)
                          .orderBy('prod_id', 'ASC')
        return row
    }
    /**
     * count lahat ng item ng dispatch na hindi pa posted temp_id
     * @param {string} temp_id  
    */
    async count_total_sku_receive(temp_id) {
        let row = await Db.joinRaw('FROM 0_receive_transfer a INNER JOIN 0_receive_transfer_details b ON a.id = b.temp_receiving_id')
                          .where('a.id', temp_id)
                          .andWhere('a.posted', 0)
                          .count('* as total')
        return row[0].total
    }

    /**
     * count lahat ng item ng dispatch na posted or hindi pa posted
     * @param {int} temp_id 
    */
    async count_total_all_sku_receive(temp_id) {
        let row = await Db.joinRaw('FROM 0_receive_transfer a INNER JOIN 0_receive_transfer_details b ON a.id = b.temp_receiving_id')
                          .where('a.id', temp_id)
                          .groupBy('b.prod_id')
        return row.length
    }

     /**
     * total lahat ng item or sku na hindi pa posted sa p.o
     * @param {int} temp_id 
    */
    async sum_total_qty_scanned_receive(temp_id) {
        let row = await Db.joinRaw('FROM 0_receive_transfer a INNER JOIN 0_receive_transfer_details b ON a.id = b.temp_receiving_id')
                          .where('a.id', temp_id)
                          .sum('b.qty as qty')
        return (row[0].qty == null) ? 0 : row[0].qty
    }
    /**
     * @param {int} transfer_no 
    */

    async fetch_transfer_items_receive(transfer_no) {
        let row = await Db.connection('transfers')
                            .select('transfer_id', 'description', 'actual_qty_out', 'uom', 'stock_id_2')
                            .from('0_transfer_details')
                            .where('transfer_id', transfer_no)  
                            .orderBy('description', 'ASC')
        return row
    }
    /**
     * count item temporary using lenght of array return value
     * @param {int} temp_id 
     * @param {int} transfer_no 
     */
    async counts_items(temp_id, transfer_no) {
        let row = await Db.select('temp_receiving_id')
                          .joinRaw('FROM 0_receive_transfer a INNER JOIN 0_receive_transfer_details b ON a.id = b.temp_receiving_id')
                          .where('a.transfer_id', transfer_no)
                          .andWhere('temp_receiving_id', temp_id)
        return row.length
    }

    /**
     * delete header item
     * @param {int} temp_id 
     * @param {string} transfer_id 
     */
    async delete_header_items(temp_id, transfer_id) {
        let res = await Db.table('0_receive_transfer')
                          .where('transfer_id', transfer_id)
                          .andWhere('id', temp_id)
                          .delete()
        return res
    }

    /**
     * delete items 0_receive_transfer_details
     * @param {int} id 
     */
    async delete_items(id) {
        let res = await Db.table('0_receive_transfer_details')
                        .where('id', id)
                        .delete()
        return res
    }

    /**
     * @param {int} temp_id 
     */
    async fetch_receive_product_id(temp_id) {
        let row = await Db.select('prod_id', 'barcode', 'qty')
                          .from('0_receive_transfer_details')
                          .where('temp_receiving_id', temp_id)
        return (row.length == 0) ? 0 : row
    }

    /**
     * @param {int} temp_id 
    */
   async fetch_temporary_items(temp_id) {
        let row = await Db.from('0_receive_transfer_details')
                          .where('temp_receiving_id', temp_id)
                          .orderBy('prod_id', 'ASC')
        return row
    }

    /**
     * 
     * @param {int} movement_no 
     * @param {object} details // mvement header data 
     * @param {object} srspos rollback 
     */
    async add_receiving_movement(movement_no, details, srspos, transfer_id,sourceinvoiceno) {
        try {
          let today = moment().format(TO_DATE) + ' 00:00:00'
          let data = {
              movementno : movement_no.toString(),
              movementcode: details.movement_code.toString(),
              referenceno: 'STI-'+transfer_id,
              sourceinvoiceno:  sourceinvoiceno,
              sourcedrno:  '',
              todescription: details.to_description,
              toaddress: '',
              contactperson: '',
              fromdescription: details.from_description,
              fromaddress: '',
              datecreated: today,
              lastmodifiedby: details.user_id,
              lastdatemodified: today,
              status: details.stats.toString(),
              postedby: details.user_id,
              posteddate: today,
              terms: '0',
              transactiondate: today,
              fieldstylecode1: null,
              nettotal: details.net_total.toString(),
              statusdescription: 'POSTED',
              totalqty: details.total_qty.toString(),
              createdby: details.user_id,
              remarks: 'STI',
              customercode: null,
              vendorcode: null,
              branchcode: null,
              cashdiscount: '',
              fieldStylecode: null,
              tobranchcode: '',
              fieldStylecode: '',
              tobranchcode: '',
              frbranchcode: '',
              sourcemovementno: '',
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
        } catch (error) {
          console.log(error, 'ERROR MOVEMENTS INSERT')
          throw new Error(error.toString())
        }
    }

    /**
     * @param {string} code 
     */
    async fetch_aria_db(code) {
        let row = await Db.connection('transfers')
                          .select('aria_db')
                          .from('0_branches')
                          .where('code', code)
        return row[0].aria_db
    }

    /**
     * @param {string} code 
     */
    async fetch_gl_stock_to(brcode) {
        let row = await Db.connection('transfers')
                          .select('gl_stock_from')
                          .from('0_branches')
                          .where('code', brcode)
        return row[0].gl_stock_from
    }
    /**
     * @param {object} srs_transfers rollback
     * @param {string} aria_db 
     * @param {int} m_type 
     * @param {int} transfer_id 
     * @param {float} debit_account 
     * @param {float} net_of_vat_total 
     */
    async add_gl_trans(srs_transfers, aria_db, m_type, transfer_id, account, net_of_vat_total) {
            let data = {
                type: m_type,
                type_no: transfer_id,
                tran_date: moment().format(TO_DATE),
                account: account,
                dimension_id: 0,
                dimension2_id: 0,
                memo_: '',
                amount: net_of_vat_total,
            }
    
            await srs_transfers.insert(data)
                               .into(`${aria_db}.0_gl_trans`)
        
    }
    /**
     * @param {boject} srs_transfers rollback
     * @param {int} user_id 
     * @param {int} movement_id 
     * @param {int} transfer_id 
     * @param {string} delivered_by 
     * @param {string} checked_by 
     */
    async update_header_transfer(srs_transfers, user_id, movement_id, movement_no, transfer_id, remarks) {
        let data = {
            aria_type_in: 71,
            aria_trans_no_in: transfer_id,
            name_in: user_id,
            m_id_in: movement_id,
            m_no_in: movement_no,
            m_code_in: 'STI',
            transfer_in_date: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            remarsk_descrip: remarks,
        }

        return await srs_transfers.table('0_transfer_header')
                                  .where('id', transfer_id)
                                  .update(data)
    }
    /**
     * @param {int} movement_id 
     * @param {object} row 
     * @param {int} unit_cost 
     * @param {int} qty 
     * @param {object} srspos rollback 
     */
    async add_receiving_movement_line(movement_id, row, unit_cost, qty, srspos) {
        let cost = parseFloat(unit_cost) * parseFloat(qty)
        let pack = row.pack
        let barcode = row.barcode
        let data = {
            MovementID: movement_id.toString(),
            ProductID: row.productid.toString(),
            ProductCode: row.productcode.toString(),
            Description: row.description.replace(/'/g,""),
            uom: row.uom,
            unitcost: unit_cost.toString(),
            qty: `${Math.abs(qty)}`,
            extended: `${cost.toFixed(4)}`,
            pack: pack.toString(),
            barcode: barcode.toString()
        }
       
        return await srspos.insert(data)
                           .into('movementline')
        
    }
    /**
     * @param {int} movement_id 
     * @param {object} row 
     * @param {int} unit_cost 
     * @param {int} qty 
     * @param {object} product 
     * @param {object} srspos rollback 
     */
    async add_receiving_movement_line_gained(movement_id, temp_items, pack, qty, product, srspos) {
        try {
          let cost = parseFloat(product.costofsales) * Math.abs(parseFloat(qty))
          let barcode = temp_items.barcode
          let data = {
              MovementID: movement_id.toString(),
              ProductID: product.productid.toString(),
              ProductCode: product.productcode.toString(),
              Description: product.description.replace(/'/g,""),
              uom: temp_items.uom,
              unitcost: product.costofsales.toString(),
              qty: Math.abs(product.sellingarea),
              extended: `${cost.toFixed(4)}`,
              pack: pack.toString(),
              barcode: barcode.toString()
          }
          
          await srspos.insert(data)
                            .into('movementline')

          let row = await srspos.raw(`SELECT IDENT_CURRENT('movementline') as last_id`)
          return row[0].last_id
        } catch (error) {
          console.log(error, 'ERROR INSERT MOVEMENTLINE')
          throw new Error(error.toString())
        }
        
    }
    /**
     * @param {int} movement_id 
     * @param {object} row 
     * @param {int} unit_cost 
     * @param {int} qty 
     * @param {object} product 
     * @param {object} srspos rollback 
     */
    async add_receiving_movement_line_loss(movement_id, temp_items, pack, gain_qty, product, srspos) {
        let cost = parseFloat(product.costofsales) * parseFloat(gain_qty)
        let barcode = temp_items.barcode
        let data = {
            MovementID: movement_id.toString(),
            ProductID: product.productid.toString(),
            ProductCode: product.productcode.toString(),
            Description: product.description.replace(/'/g,""),
            uom: temp_items.uom,
            unitcost: product.costofsales.toString(),
            qty: gain_qty,
            extended: `${cost.toFixed(4)}`,
            pack: pack.toString(),
            barcode: barcode.toString()
        }
        
        await srspos.insert(data)
                           .into('movementline')

        let row = await srspos.raw(`SELECT IDENT_CURRENT('movementline') as last_id`)
        return row[0].last_id
        
    }
    /**
     * @param {*} srspos 
     * @param {int} movement_id 
     * @param {int} movement_no 
     * @param {float} selling_area_in 
     * @param {float} selling_area_out 
     * @param {string} description 
     * @param {oject} row 
     */

    async add_product_history_receiving(srspos, movement_id, movement_no, selling_area_in, selling_area_out, description, user_id, row){
        let data = {
            productid : row.productid.toString(),
            barcode: row.barcode.toString(),
            transactionid: movement_id.toString(),
            transactionno: movement_no.toString(),
            dateposted: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            transactiondate: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
            description: description,
            beginningsellingarea: row.selling_area_qty.toString(),
            beginningstockroom: null,
            flowstockroom: '0',
            flowsellingarea: '1',
            sellingareain: selling_area_in,
            sellingareaout: selling_area_out,
            stockroomin: null,
            stockroomout: null,
            unitcost: row.unit_cost.toString(),
            damagedin: null,
            damagedout: null,
            layawayin: null,
            layawayout: null,
            onrequestin: null,
            onrequestout: null,
            postedby: user_id,
            datedeleted: null,
            deletedby: null,
            movementcode: 'STI',
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
     * @param {object} srs_transfers rollback
     * @param {int} transfer_id 
     * @param {object} row 
     */
    async update_transfer_details(srs_transfers, transfer_id, row) {
        let data = {
            qty_in: row.qty,
        }

        await srs_transfers.table('0_transfer_details')
                           .where('transfer_id', transfer_id)
                           .andWhere('stock_id_2', row.productid.toString())
                           .andWhere('uom', row.uom)
                           .update(data)
    }
    /**
     * 
     * @param {int} qty_per_pcs 
     * @param {int} prod_id 
     */
    async update_product_selling_area(srspos, new_cost, qty_per_pcs, row) {
      console.log( new_cost, qty_per_pcs, row, 'newcost trigger')
        let data = {
            costofsales: new_cost,
            sellingarea: parseFloat(row.selling_area_qty) + parseFloat(qty_per_pcs),
            lastdatemodified: moment().format('YYYY-MM-DD HH:mm:ss.SSS')
        }
        await srspos.table('products')
                    .where('productid', row.productid)
                    .update(data)
    }
    /**
     * @param {int} temp_id 
     * @param {int} prod_id 
    */
   async fetch_temporary_product_id_items(temp_id, prod_id) {
    let row = await Db.connection('receiving_new')
                    .from('0_receive_transfer_details')
                    .where('temp_receiving_id', temp_id)
                    .andWhere('prod_id', prod_id)
    return row[0]
}
    /**
     * @param {int} transfer_id 
     * @param {int} productid 
     * @param {int} barcode 
     * @param {float} qty 
     */
    async fetch_transfer_out_cost(transfer_id, productid, barcode, qty) {
        let row = await Db.connection('transfers')
                          .select('cost')
                          .from('0_transfer_details')
                          .where('transfer_id', transfer_id)
                          .andWhere('stock_id_2', productid)
                          .andWhere('barcode', barcode)
                          .andWhere('actual_qty_out', '>', 0)
        return (row.length == 0) ? 0 : parseFloat(row[0].cost) / parseFloat(qty)
    }

    /**
     * @param {int} transfer_id 
     * @param {int} productid 
     * @param {int} barcode 
     */
    async fetch_transfer_cost(transfer_id, productid, barcode) {
        let row = await Db.connection('transfers')
                          .select('cost')
                          .from('0_transfer_details')
                          .where('transfer_id', transfer_id)
                          .andWhere('stock_id_2', productid)
                          .andWhere('actual_qty_out', '>', 0)
        return (row.length == 0) ? 0 : parseFloat(row[0].cost)
    }

    /**
     * @param {object} srspos rollback
     * @param {object} srs_transfers rollback
     * @param {int} movement_id 
     * @param {int} movement_no 
     * @param {int} transfer_id 
     * @param {int} user_id 
     * @param {object} row 
     */
    async add_adjustment_movement_line(srspos, srs_transfers , movement_id, movement_no, transfer_id, user_id, row) {
        try {
            
            let unit_cost = parseFloat(row.unit_cost) * parseFloat(row.pack)
            let qty       = parseFloat(row.qty)

            let qty_per_pcs = parseFloat(row.qty) * parseFloat(row.pack)
            let barcode     = row.barcode

            if (qty < 0) {
                qty = 0
            }

            if(unit_cost == 0) {
              console.log(unit_cost + ' unit cost is 0 ' + row.productid)
              await srspos.rollback()
              return false
            }

            await this.add_receiving_movement_line(movement_id, row, unit_cost, qty, srspos)

            let movement_types = await PosMod.fetch_movement_types(srspos, 'STI')
            if (movement_types == "") {
                await srspos.rollback()
                return false
            }

            let description      = movement_types.description
            let selling_area_in  = qty_per_pcs
            let selling_area_out = null

            await this.add_product_history_receiving(srspos, movement_id, movement_no, selling_area_in, selling_area_out, description, user_id, row)
            await this.update_transfer_details(srs_transfers, transfer_id, row)

            let new_cost    = row.costofsales
            let old_stock   = parseFloat(row.selling_area_qty) 
            let old_per_pcs = parseFloat(old_stock) + parseFloat(qty_per_pcs)

            let prod_id = row.productid
            let prod_details = await PosMod.fetch_products(srspos, prod_id)
            let parent_category = prod_details.levelfield1code
            let child_category = prod_details.levelfield2code

            // if(parent_category == "10061" && child_category == '') {
            //     new_cost = await this.fetch_transfer_cost(transfer_id, prod_id, barcode) / row.pack
            // } else {
                if (old_per_pcs.toFixed(4) != 0) {
                    let old_stock_cost         = parseFloat(old_stock) * parseFloat(row.costofsales)
                    let old_stock_cost_ext_fix = parseFloat(old_stock_cost) + (parseFloat(row.unit_cost) * parseFloat(qty_per_pcs))
                    let old_stock_cost_ext     = old_stock_cost_ext_fix.toFixed(4)
                    let stock_qty_per_pcs      = parseFloat(old_stock_cost_ext) / (parseFloat(old_stock) + parseFloat(qty_per_pcs))
                    new_cost = stock_qty_per_pcs.toFixed(4)
                }
            // }
       

           // await this.update_product_selling_area(srspos, new_cost, qty_per_pcs, row)
            
            if(parent_category == "10061" && child_category == '') {
                await this.update_vendor_cost(srspos, new_cost, prod_id)
                let pos_product = await PosMod.fetch_pos_products({ productid: prod_id }, 'productid, barcode, uom, markup, srp, description, pricemodecode', srspos)
                for(const row of pos_product) {
                    let final_srp = parseFloat(new_cost)
                    if(parseFloat(row.markup) != 100 || parseFloat(row.markup) != 100.00) {
                        let srp = (parseFloat(new_cost) / ((100 - parseFloat(row.markup)) / 100))
                        final_srp = Math.ceil(srp)
                    }

                    let old_srp        = row.srp
                    let old_pricemode  = row.pricemodecode
                    let old_uom        = row.uom
     
                    let price_details  = {
                        productid: row.productid,
                        barcode: row.barcode,
                        pricemodecode: old_pricemode,
                        dateposted: moment().format('YYYY-MM-DD HH:mm:ss.SSS'),
                        postedby: user_id,
                        fromsrp: old_srp,
                        tosrp: final_srp,
                        UOM: old_uom,
                        markup: row.markup,
                        initialprice: 1
                    }
                    //await this.add_price_change_history(price_details, srspos)
                    //await this.update_pos_srp(final_srp, srspos, row.barcode)
                }
            }
            return [new_cost, qty_per_pcs]
        } catch (error) {
            console.log(error.toString())
            return false
        }
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
     * @param {object} price_details 
     */
    async add_price_change_history(data, srspos){
        await srspos.insert(data)
                    .into('pricechangehistory')
    }
    
    async update_vendor_cost(srspos, new_cost, prod_id) {
        return await srspos.raw(`UPDATE vendor_products 
        SET cost = ROUND(?,4), 
        averagecost = ROUND(?,4), 
        averagenetcost = ROUND(?,4)  
        WHERE productid = ? AND defa = 1`, [new_cost, new_cost, new_cost, prod_id])
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
     * 
     * @param {object} srspos rollback
     * @param {float} extended 
     * @param {float} qty 
     * @param {int} receiving_movement_id 
     */
    async update_movement_ms(srspos, extended, qty, receiving_movement_id) {
        let data = {
            NetTotal: extended.toString(),
            totalqty: qty.toString()
        }
        await srspos.table('movements')
                    .where('movementid', receiving_movement_id)
                    .update(data)
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

    async post_auto_gained(srspos,  temp_id, user_id, remark, transfer_id, selling_area_negative) {
        try {
            let movement_code = 'AIG'
            let aig_counter   =  await PosMod.fetch_counter(srspos, movement_code)
            let ig_counter    = leftPad(aig_counter, 10, 0)
            let sourceinvoiceno = ''
            let company          = await PosMod.get_company()
            let movement_details = {
                movement_code: movement_code,
                from_description: company, 
                to_description: 'SELLING AREA', 
                stats: 2, 
                net_total: '0', 
                total_qty: '0',
                user_id: user_id,
                company: company
            }
            let receiving_movement_id = await this.add_receiving_movement(ig_counter, movement_details, srspos, transfer_id,sourceinvoiceno)

            let qty      = 0
            let extended = 0

            for (const productid of selling_area_negative) {
                let products   = await PosMod.fetch_products(srspos, productid)
                if (products.sellingarea >= 0) {
                    await srspos.rollback()
                    await srs_receiving.rollback()
                    throw new CustomException({ message: `Product id is not negative ${productid}` }, 401)
                }

                let temporary_items = await this.fetch_temporary_product_id_items(temp_id, productid)
                let barcode  = temporary_items.barcode
                let pos_prod = await PosMod.fetch_pos_product({ barcode }, 'qty', srspos)
                let pack     = parseFloat(pos_prod[0].qty) / parseFloat(pos_prod[0].qty)
                let qty_s    = parseFloat(products.sellingarea) * pack

                        qty = qty + Math.abs(parseFloat(products.sellingarea))
                let extended_s = parseFloat(extended + Math.round(parseFloat(products.costofsales) * Math.abs(qty_s)))
                    extended   = extended_s.toFixed(4)
                
                let movement_line_id = await this.add_receiving_movement_line_gained(receiving_movement_id, temporary_items, pack, qty_s, products, srspos)
                
                await this.add_product_history_auto_gained(srspos, products, barcode, movement_line_id, ig_counter, user_id) 
                await this.update_products_gained_qty(srspos, productid)
            } // end loop negative

            await this.update_movement_ms(srspos, extended, qty, receiving_movement_id)
            return receiving_movement_id
        } catch (error) {
            console.log(error)
            console.log(error.toString())
            return false
        }
        
    }
    /**
     * 
     * @param {object} srspos rollback
     * @param {srs_receiving} srs_receiving rollback
     * @param {int} receiving_movement_id 
     * @param {int} productid 
     */
    async fetch_gain_qty(srspos, srs_transfers, receiving_movement_id, productid) {
        let row = await srspos.select('qty')
                        .from('movementline')
                        .where('movementid', receiving_movement_id)
                        .andWhere('productid', productid)
        if (row.length == 0) {
            await srspos.rollback()
            await srs_transfers.rollback()
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
            postedby: user_id.toString(),
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
    async post_auto_loss(srspos, srs_transfers, temp_id, user_id, remark, transfer_id, receiving_movement_id, selling_area_negative) {
        try {
            let movement_code = 'AIL'
            let ail_counter   = await PosMod.fetch_counter(srspos, movement_code)
            let il_counter    = leftPad(ail_counter, 10, 0)
            let sourceinvoiceno = ''
            let company          = await PosMod.get_company()
            let movement_details = {
                movement_code: movement_code,
                from_description: company, 
                to_description: 'SELLING AREA', 
                stats: 2, 
                net_total: '0', 
                total_qty: '0',
                user_id: user_id,
                company: company
            }
            let lost_movement_id = await this.add_receiving_movement(il_counter, movement_details, srspos, transfer_id,sourceinvoiceno)
            
            let qty      = 0
            let extended = 0

            for (const productid of selling_area_negative) {
                let products   = await PosMod.fetch_products(srspos, productid)
                let temporary_items = await this.fetch_temporary_product_id_items(temp_id, productid)
                let barcode  = temporary_items.barcode
                let pos_prod = await PosMod.fetch_pos_product({ barcode }, 'qty', srspos)
                let gain_qty = await this.fetch_gain_qty(srspos, srs_transfers, receiving_movement_id, productid)
                let pack = pos_prod[0].qty / pos_prod[0].qty
                let qty_s = gain_qty * pack
                qty = qty + Math.abs(parseFloat(gain_qty))
                let extended_s = parseFloat(extended + Math.round(parseFloat(products.costofsales) * Math.abs(qty_s)))
                    extended   = extended_s.toFixed(4)
                    await this.add_receiving_movement_line_loss(lost_movement_id, temporary_items, pack, gain_qty, products, srspos)
                    await this.add_product_history_auto_loss(srspos, products, barcode, gain_qty, lost_movement_id, il_counter, user_id) 
                
                let update_qty = products.sellingarea - gain_qty
                await this.update_products_loss_qty(srspos, productid, update_qty)
            } // end loop negative

            await this.update_movement_ms(srspos, '', '', lost_movement_id)
        } catch (error) {
            console.log(error.toString())
            return false
        }
    }
 

    async addReturnTransfers(trx,rowData,returneditems) {
    try{
        let data   = {
            CustomerName: rowData.memo_ ,
            DateServed: rowData.delivery_date ,
            OldTransactionNo: rowData.m_no_out ,
            OldTerminalNo: rowData.m_id_out ,
            Barcode: rowData.barcode ,
            ProductName: rowData.description ,
            Qty: returneditems ,
            Srp: rowData.cost

        }
       let result =  await trx.insert(data)
                 .into('franchisee_return') 
         return result[0]
    } catch (error) {
        console.log(error.toString())
        return false
    }
        
    }
    
    async post_receiving(temp_id, user_id, remark, transfer_id, selling_area_negative=null) {
        let srspos = await Db.connection('srspos').beginTransaction()
        let srs_transfers = await Db.connection('transfers').beginTransaction()
        try {
          
              let checkPlPosted = await srspos.raw(`SELECT TOP 1 * FROM Movements WHERE ReferenceNo = ?`, ['STI-'+transfer_id])
            if(checkPlPosted.length === 1) {
              await srs_transfers.rollback()
              await srspos.rollback()
              throw new Error('PL # IS ALREADY POSTED PLEASE PAKI TINGNAN PO ANG IYONG DATABASE !!!') 
            } 

            //AUTO GAINED
            let receiving_movement_id = 0
            if (selling_area_negative != null) {
                receiving_movement_id = await this.post_auto_gained(srspos, temp_id, user_id, remark, transfer_id, selling_area_negative)
                if(receiving_movement_id == false) {
                    await srs_transfers.rollback()
                    await srspos.rollback()
                    throw new Error('Error post auto gained Contact I.T Programmer')
                }
            }
            
            let transfer = await this.fetch_transfer_header(transfer_id)
            //RECEIVING
            let unit_cost     = 0
            let total_qty     = 0
            let net_total = 0 
            let temp_item_re  = []
            let product       
            let gmovement_no = await PosMod.fetch_counter(srspos, 'STI')
            let movement_no  = leftPad(gmovement_no, 10, 0)
            let from_description  =  `SAN ROQUE SUPERMARKET ` + transfer.br_code_out
            let to_description    =  `SAN ROQUE SUPERMARKET ` + transfer.br_code_in
            let to_address        = ""
            let contact_person    = ""
            let remarks           = ""
            let stats             = 2
            let movement_status   = "POSTED"
            let parent_category   = ""
            let child_category    = ""
            let sourceinvoiceno   = transfer.m_no_out

            let temporary_items_list = await this.fetch_temporary_items(temp_id)
            for(const row of temporary_items_list) {
                let barcode   = row.barcode
                let pos_prod  = await PosMod.fetch_pos_product({ barcode }, 'qty, productid, productcode, description, uom', srspos)
               // console.log(pos_prod[0].qty+'qtytytyty');
                let productid = pos_prod[0].productid
                    product   = await PosMod.fetch_products(srspos, productid)
                let costofsales = product.costofsales
                let selling_area_qty = product.sellingarea
                let selling_area_dmg = product.damaged
                let selling_areastock_room = product.stockroom
                    parent_category = product.levelfield1code
                    child_category = product.levelfield2code
                    unit_cost = await this.fetch_transfer_out_cost(transfer_id, productid, barcode, pos_prod[0].qty)
                    temp_item_re.push({
                        productid: productid,
                        productcode: pos_prod[0].productcode,
                        description: pos_prod[0].description,
                        uom: pos_prod[0].uom,
                        unit_cost: unit_cost,
                        costofsales: costofsales,
                        qty: row.qty,
                        pack: pos_prod[0].qty,
                        barcode: barcode,
                        selling_area_qty: selling_area_qty,
                        selling_area_dmg: selling_area_dmg,
                        selling_areastock_room: selling_areastock_room,
                        user_id: user_id
                    })

                    total_qty += row.qty
                    net_total += parseFloat(unit_cost) * parseFloat(row.qty) * parseFloat(pos_prod[0].qty)
            }

            let movement_details = {
                movement_code: 'STI',
                from_description, 
                to_description, 
                stats, 
                movement_status, 
                net_total, 
                total_qty,
                user_id
            }

            let movement_id      = await this.add_receiving_movement(movement_no, movement_details, srspos, transfer_id,sourceinvoiceno)
            // let m_type           = 71
            // let debit_account    = 570001
            // let credit_account   = 2350017
            // let aria_db          = await this.fetch_aria_db(transfer.branch_in)
            let net_of_vat_total = net_total
            let tax_rate         = 12

                // credit_account    = await this.fetch_gl_stock_to(transfer.branch_out)
            
            if (product.pvatable) {
                net_of_vat_total = (net_of_vat_total / (1+ (tax_rate/ 100 )))
            }

            // await this.add_gl_trans(srs_transfers, aria_db, m_type, transfer_id, debit_account, net_of_vat_total)
            // await this.add_gl_trans(srs_transfers, aria_db, m_type, transfer_id, credit_account, -net_of_vat_total)

            let fline = [];
            for (const row of temp_item_re) {

                let result = await this.add_adjustment_movement_line(srspos, srs_transfers, movement_id, movement_no, transfer_id, user_id, row)
                
                if (!result) {
                    await srs_transfers.rollback()
                    await srspos.rollback()
                    throw new Error('Error adjustment line')
                }

                let new_cost = result[0]
                let qty_per_pcs = result[1]

                if(fline[row.productid]){
                        fline[row.productid]['qty_per_pcs'] = fline[row.productid]['qty_per_pcs'] + qty_per_pcs
                }else{
                        fline[row.productid] = 
                        {
                            productid : row.productid,
                            new_cost:  new_cost,
                            qty_per_pcs : qty_per_pcs,
                            row : row   
                        }
                }            
                
            }

            for(const key in fline) {

              let ftotal_qty_per_pcs =  fline[key]['qty_per_pcs']
              let  frow =  fline[key]['row']
              let fcost = fline[key]['new_cost']
               await this.update_product_selling_area(srspos,fcost, ftotal_qty_per_pcs, frow)
            }
            
            await this.update_header_transfer(srs_transfers, user_id, movement_id, movement_no, transfer_id, remark)

            //AUTO LOSS
            if (selling_area_negative != null) {
                let auto_loss = await this.post_auto_loss(srspos, srs_transfers, temp_id, user_id, remark, transfer_id, receiving_movement_id, selling_area_negative)
                if(auto_loss == false) {
                    await srspos.rollback()
                    await srs_transfers.rollback()
                    throw new Error('Error post auto loss Contact I.T Programmer')
                }
            }

             //AUTO LOSS
            await srs_transfers.commit()
            await srspos.commit()
            await this.update_transfer_posted(transfer_id)

            let transfer_res = await this.fetchTransferDetails(transfer_id) // pang get ng details

            let mainnova = await Db.connection('mainnova').beginTransaction()
            for(const row of transfer_res) {
                let actual_qty_out = parseFloat(row.actual_qty_out)
                let qty_in = parseFloat(row.qty_in)
                let returned_items = actual_qty_out - qty_in

                if(returned_items > 0 ){

                   let returns =  await this.addReturnTransfers(mainnova,row,returned_items) // ito yung pang insert na part
                    if(returns == false) {
                        await srspos.rollback()
                        await srs_transfers.rollback()
                        throw new Error('Error post return Contact I.T Programmer')
                    }
                       
                }
            } 
            await mainnova.commit() 
          
         
            // if(parent_category == "10061" && child_category == '') {
            //     await OpenPoVariableMod.update_scale(user_id)
            // }
            
          //  throw new Error('error')
        } catch (error) {
            console.log(error.toString())
            console.log(error)
            console.log(error.message)
            await srspos.rollback()
            await srs_transfers.rollback()
            throw new Error(error.toString())
        }
        
    }

    async fetch_transfer_slip(p_transfer_no, p_date_from, p_date_to) {
        let row = await Db.connection('transfers')
                          .select('a.*', 'b.name as branch_from', 'c.name as branch_to')
                          .joinRaw('FROM 0_transfer_header a INNER JOIN 0_branches b ON a.br_code_out = b.code INNER JOIN 0_branches c ON a.br_code_in = c.code')
                          .whereRaw(`DATE(transfer_out_date) >= ? AND DATE(transfer_out_date) <= ? 
                          AND (br_code_out = ? OR br_code_in = ?) 
                          ${(p_transfer_no  == "") ? '' : "AND a.id = "+p_transfer_no+" " }`, [p_date_from, p_date_to, BRANCH_CODE, BRANCH_CODE])
        return row
    }
   
    async fetch_transfer_slip_header(p_transfer_no) {
        let row = await Db.connection('transfers')
                          .select('a.date_created', 'a.transfer_out_date', 'a.delivered_by', 'a.checked_by',  'b.name as branch_from', 'c.name as branch_to', 'a.requested_by')
                          .joinRaw('FROM 0_transfer_header a INNER JOIN 0_branches b ON a.br_code_out = b.code INNER JOIN 0_branches c ON a.br_code_in = c.code')
                          .where('a.id', p_transfer_no)
        return row[0]
    }

    async fetch_transfer_slip_item(p_transfer_no) {
      const list = await Db.connection('transfers')
                        .from('0_transfer_details')
                        .where('transfer_id', p_transfer_no)
      for(const row of list) {
        Object.assign(row, { 
          confirm_name: await PosMod.fetch_name(row.confirm_name)
        })
      }

      return list
  }
}
module.exports = new TransferReceive
