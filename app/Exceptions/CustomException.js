'use strict'

const { LogicalException } = require('@adonisjs/generic-exceptions')
const AuditTrailMod      = use('App/Models/AuditTrail')
const Redis = use('Redis')
class CustomException extends LogicalException {

  async handle (error, { response, request }) {
    const message     = error.message
    const tracking_no = await this.add_audit_trail(request, message)
    message.message   = message.message.toUpperCase() + '<br>ERROR #' + tracking_no
    console.log(message)
    response.status(error.status).json({ error:  message  })
  }

  async add_audit_trail(request, message) {
    const user_id     = await Redis.get(request.user_id)
    const tracking_no = await AuditTrailMod.fetch_audit_trail_id()
    let data = {
      tuser_id : (user_id == null) ? 0 : user_id,
      ttracking_no: 'TN'+tracking_no,
      tdescription: message.message,
    }
    await AuditTrailMod.add_audit_trail(data)
    return data.ttracking_no
  }

}

module.exports = CustomException
