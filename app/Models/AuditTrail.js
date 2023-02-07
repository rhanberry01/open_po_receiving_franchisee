'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const Db = use('Database')

class AuditTrail extends Model {

    async add_audit_trail(data) {
        return await Db.insert(data).into('0_audit_trail_new')
    }

    async fetch_audit_trail_id(){
        let row = await Db.select('tid')
                       .from('0_audit_trail_new')
                       .limit(1)
                       .orderBy('tid', 'desc')
        return (row.length == 0 ) ? 1 : parseFloat(row[0].tid) + 1
    }
}

module.exports = new AuditTrail
