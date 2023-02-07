'use strict'
const OpenPoVariableMod  = use('App/Models/OpenPoVariable')

class PhpThirdPartyApiController {

  async updateScale({request, response, view}) {
    // if(parent_category == "9092" && child_category == '0006') {
      let userId = 2019
      await OpenPoVariableMod.update_scale(userId)
    // }
    response.send('done');
    // return view.render('scale')
  }
}

module.exports = PhpThirdPartyApiController
