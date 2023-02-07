'use strict'

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| Http routes are entry points to your web application. You can create
| routes for different URLs and bind Controller actions to them.
|
| A complete guide on routing is available here.
| http://adonisjs.com/docs/4.0/routing
|
*/

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')
const Env = use('Env')
Route.group(() => {
  
  Route.post('/purchaser/receive_po/auth', 'AuthController.auth')
  Route.get('/purchaser/receive_po/third_pary/php', 'TransferReceiveController.authPhpThirdParty')
  Route.get('/purchaser/receive_po/logout', 'AuthController.logout')
  
  
  Route.get('/purchaser/receive_po/fetch_po', 'ReceivePoController.fetch_po')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/fetch_temporary_items', 'ReceivePoController.fetch_temporary_items')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/fetch_pending_po', 'ReceivePoController.fetch_pending_po')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/fetch_barcode', 'ReceivePoController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/delete_items', 'ReceivePoController.delete_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/post_receiving', 'ReceivePoController.post_receiving')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/fetch_po_inquiry', 'ReceivePoController.fetch_po_inquiry')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/fetch_expected_delivery', 'ReceivePoController.fetch_expected_delivery')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/update_inv', 'ReceivePoController.update_inv')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/request', 'ReceivePoController.requestPo')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/fetch_pending_po_request', 'ReceivePoController.fetch_pending_po_request')
  .middleware(['checkUser'])

// set api auto
Route.post('/purchaser/receive_po/transfer/receive_auto/post_receiving', 'TransferRecieveAutoController.post_receiving')
// set api auto
  
  //price survey
  Route.get('/purchaser/receive_po_survey/fetch_po', 'ReceivePoSurveyController.fetch_po').middleware(['checkUser'])
  Route.get('/purchaser/receive_po_survey/fetch_temporary_items', 'ReceivePoSurveyController.fetch_temporary_items').middleware(['checkUser'])
  Route.get('/purchaser/receive_po_survey/fetch_pending_survey', 'ReceivePoSurveyController.fetch_pending_survey').middleware(['checkUser'])
  Route.post('/purchaser/receive_po_survey/fetch_barcode', 'ReceivePoSurveyController.fetch_barcode').middleware(['checkUser'])
  Route.post('/purchaser/receive_po_survey/delete_items', 'ReceivePoSurveyController.delete_items').middleware(['checkUser'])
  Route.post('/purchaser/receive_po_survey/post_receiving', 'ReceivePoSurveyController.post_receiving').middleware(['checkUser'])
  Route.get('/purchaser/receive_po_survey/fetch_survey_inquiry', 'ReceivePoSurveyController.fetch_survey_inquiry')
  .middleware(['checkUser'])
  //free goods
  Route.get('/purchaser/receive_po_free/fetch_po', 'ReceivePoFreeController.fetch_po').middleware(['checkUser'])
  Route.get('/purchaser/receive_po_free/fetch_temporary_items', 'ReceivePoFreeController.fetch_temporary_items').middleware(['checkUser'])
  Route.get('/purchaser/receive_po_free/fetch_pending_free', 'ReceivePoFreeController.fetch_pending_free').middleware(['checkUser'])
  Route.post('/purchaser/receive_po_free/fetch_barcode', 'ReceivePoFreeController.fetch_barcode').middleware(['checkUser'])
  Route.post('/purchaser/receive_po_free/delete_items', 'ReceivePoFreeController.delete_items').middleware(['checkUser'])
  Route.post('/purchaser/receive_po_free/post_receiving', 'ReceivePoFreeController.post_receiving').middleware(['checkUser'])

  Route.get('/purchaser/receive_po/transfer/dispatch/fetch_dispatch_transfer', 'TransferDispatchController.fetch_dispatch_transfer')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer/dispatch/fetch_dispatch_transfer_details', 'TransferDispatchController.fetch_dispatch_transfer_details')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer/dispatch/fetch_dispatch_transfer_details_temp', 'TransferDispatchController.fetch_dispatch_transfer_details_temp')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer/dispatch/fetch_temporary_items', 'TransferDispatchController.fetch_temporary_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/dispatch/fetch_barcode', 'TransferDispatchController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/dispatch/delete_items', 'TransferDispatchController.delete_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/dispatch/post_receiving', 'TransferDispatchController.post_receiving')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/dispatch/update_qty', 'TransferDispatchController.update_qty')
  .middleware(['checkUser'])


  Route.get('/purchaser/receive_po/transfer-community-palengke/dispatch/fetch_dispatch_transfer', 'TransferCommunityPalengkeDispatchController.fetch_dispatch_transfer')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/dispatch/fetch_dispatch_transfer_details', 'TransferCommunityPalengkeDispatchController.fetch_dispatch_transfer_details')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/dispatch/fetch_dispatch_transfer_details_temp', 'TransferCommunityPalengkeDispatchController.fetch_dispatch_transfer_details_temp')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/dispatch/fetch_temporary_items', 'TransferCommunityPalengkeDispatchController.fetch_temporary_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/dispatch/fetch_barcode', 'TransferCommunityPalengkeDispatchController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/dispatch/delete_items', 'TransferCommunityPalengkeDispatchController.delete_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/dispatch/post_receiving', 'TransferCommunityPalengkeDispatchController.post_receiving')
  .middleware(['checkUser'])
  
  Route.get('/purchaser/receive_po/transfer/receive/fetch_receive_transfer', 'TransferReceiveController.fetch_receive_transfer')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer/receive/fetch_receive_transfer_details', 'TransferReceiveController.fetch_receive_transfer_details')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer/receive/fetch_receive_transfer_details_temp', 'TransferReceiveController.fetch_receive_transfer_details_temp')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer/receive/fetch_temporary_items', 'TransferReceiveController.fetch_temporary_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/receive/fetch_barcode', 'TransferReceiveController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/receive/delete_items', 'TransferReceiveController.delete_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/receive/post_receiving', 'TransferReceiveController.post_receiving')
  .middleware(['checkUser'])

  Route.post('/purchaser/receive_po/transfer/receive_auto/post_receiving', 'TransferReceiveAutoController.post_receiving')
  // .middleware(['checkUser'])

  Route.get('/purchaser/receive_po/transfer-community-palengke/receive/fetch_receive_transfer', 'TransferCommunityPalengkeReceiveController.fetch_receive_transfer')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/receive/fetch_receive_transfer_details', 'TransferCommunityPalengkeReceiveController.fetch_receive_transfer_details')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/receive/fetch_receive_transfer_details_temp', 'TransferCommunityPalengkeReceiveController.fetch_receive_transfer_details_temp')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/receive/fetch_temporary_items', 'TransferCommunityPalengkeReceiveController.fetch_temporary_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/receive/fetch_barcode', 'TransferCommunityPalengkeReceiveController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/receive/delete_items', 'TransferCommunityPalengkeReceiveController.delete_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/receive/post_receiving', 'TransferCommunityPalengkeReceiveController.post_receiving')
  .middleware(['checkUser'])

  Route.get('/purchaser/receive_po/transfer-community-palengke/return/fetch_dispatch_transfer', 'TransferCommunityPalengkeReturnController.fetch_dispatch_transfer')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/return/fetch_dispatch_transfer_details', 'TransferCommunityPalengkeReturnController.fetch_dispatch_transfer_details')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/return/fetch_dispatch_transfer_details_temp', 'TransferCommunityPalengkeReturnController.fetch_dispatch_transfer_details_temp')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/return/fetch_temporary_items', 'TransferCommunityPalengkeReturnController.fetch_temporary_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/return/fetch_barcode', 'TransferCommunityPalengkeReturnController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/return/delete_items', 'TransferCommunityPalengkeReturnController.delete_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/return/post_receiving', 'TransferCommunityPalengkeReturnController.post_receiving')
  .middleware(['checkUser'])

  Route.get('/purchaser/receive_po/transfer-community-palengke/request/fetch_dispatch_transfer', 'TransferCommunityPalengkeRequestController.fetch_dispatch_transfer')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/request/fetch_dispatch_transfer_details', 'TransferCommunityPalengkeRequestController.fetch_dispatch_transfer_details')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/request/fetch_dispatch_transfer_details_temp', 'TransferCommunityPalengkeRequestController.fetch_dispatch_transfer_details_temp')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/request/fetch_temporary_items', 'TransferCommunityPalengkeRequestController.fetch_temporary_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/request/fetch_barcode', 'TransferCommunityPalengkeRequestController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/request/delete_items', 'TransferCommunityPalengkeRequestController.delete_items')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer-community-palengke/request/post_receiving', 'TransferCommunityPalengkeRequestController.post_receiving')
  .middleware(['checkUser'])

  Route.get('/purchaser/receive_po/transfer-community-palengke/inquiry/fetch_transfer_slip', 'TransferCommunityPalengkeReceiveController.fetch_transfer_slip')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/inquiry/fetch_transfer_slip_item', 'TransferCommunityPalengkeReceiveController.fetch_transfer_slip_item')
  .middleware(['checkUser'])

  Route.get('/purchaser/receive_po/transfer-community-palengke/inquiry/return/fetch_transfer_slip', 'TransferCommunityPalengkeReturnController.fetch_transfer_slip')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer-community-palengke/inquiry/return/fetch_transfer_slip_item', 'TransferCommunityPalengkeReturnController.fetch_transfer_slip_item')
  .middleware(['checkUser'])


  Route.get('/purchaser/receive_po/transfer/inquiry/fetch_transfer_slip', 'TransferReceiveController.fetch_transfer_slip')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/transfer/inquiry/fetch_transfer_slip_item', 'TransferReceiveController.fetch_transfer_slip_item')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/transfer/inquiry/fetch_transfer_slip_item/confirm', 'TransferReceiveController.ConfirmReceive')
  .middleware(['checkUser'])

  
  Route.get('/purchaser/receive_po/transfer/inquiry/print_slip', 'TransferReceiveController.fetch_print_slip')

  Route.get('/purchaser/receive_po/op/variable/fetch_supplier_open', 'OpenPoVariableController.fetch_supplier_open')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/variable/fetch_temporary_item', 'OpenPoVariableController.fetch_temporary_item')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/variable/delete_items', 'OpenPoVariableController.delete_items')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/variable/fetch_list_uom', 'OpenPoVariableController.fetch_list_uom')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/variable/fetch_barcode', 'OpenPoVariableController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/variable/add_item', 'OpenPoVariableController.add_item')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/variable/post_receiving', 'OpenPoVariableController.post_receiving')
  .middleware(['checkUser'])
  Route.get('purchaser/receive_po/op/inquiry/fetch_open_inquiry', 'OpenPoVariableController.fetch_open_inquiry')
  .middleware(['checkUser'])
  Route.get('purchaser/receive_po/op/inquiry/fetch_price_change', 'OpenPoVariableController.fetch_price_change')
  .middleware(['checkUser'])

  //FIXED
  Route.get('/purchaser/receive_po/op/fixed/fetch_supplier_open', 'OpenPoFixedController.fetch_supplier_open')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/fixed/fetch_temporary_item', 'OpenPoFixedController.fetch_temporary_item')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/fixed/delete_items', 'OpenPoFixedController.delete_items')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/fixed/fetch_list_uom', 'OpenPoFixedController.fetch_list_uom')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/fixed/fetch_barcode', 'OpenPoFixedController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/fixed/add_item', 'OpenPoFixedController.add_item')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/fixed/post_receiving', 'OpenPoFixedController.post_receiving')
  .middleware(['checkUser'])
  
  //FIXED
  Route.get('/purchaser/receive_po/op/meat/fetch_supplier_open', 'OpenPoMeatController.fetch_supplier_open')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/meat/fetch_temporary_item', 'OpenPoMeatController.fetch_temporary_item')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/meat/delete_items', 'OpenPoMeatController.delete_items')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/meat/fetch_list_uom', 'OpenPoMeatController.fetch_list_uom')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/op/meat/fetch_barcode', 'OpenPoMeatController.fetch_barcode')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/meat/add_item', 'OpenPoMeatController.add_item')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/op/meat/post_receiving', 'OpenPoMeatController.post_receiving')
  .middleware(['checkUser'])
  
  Route.get('/purchaser/receive_po/po/fetch_po_list', 'ReceivePoController.fetch_po_list')
  .middleware(['checkUser'])
  Route.get('/purchaser/receive_po/po/update_po', 'ReceivePoController.update_po')
  .middleware(['checkUser'])
  Route.post('/purchaser/receive_po/po/post_upload_invoice', 'ReceivePoController.post_upload_invoice')
  .middleware(['checkUser'])
  
  Route.get('/purchaser/receive_po/timbangan/report', 'OpenPoVariableController.weighingScaleReport')
  // .middleware(['checkUser'])

  Route.get('/system/website/fetch_page_body', 'SystemController.fetch_page_body')

  Route.get('/php/third_party/update_scale', 'PhpThirdPartyApiController.updateScale')
}).prefix('api')

Route.any('*', function ({ view, request }) {
  const url = request.protocol() + '://' + request.hostname() + ':' + Env.get('PORT', '')

  if(request.hostname() === "srsnetwork.dyndns.org") {
    return view.render('index', { APP_URL: url})
  } else if (request.hostname() === "192.168.5.16") {
    return view.render('index', { APP_URL: url })
  }else {
    return view.render('index', { APP_URL: Env.get('APP_URL', '')})
  }
// console.log( Env.get('APP_URL', ''))
})