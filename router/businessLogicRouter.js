const express = require('express')
const app = express()
const bodyParser = require('body-parser')
//const moment = require('moment')
//const date = moment()
const pool = require('../models/dataBseAdapter')
const logger = require('../utils/logger')
const businessLogic = require('../controller/businessLogicClr')
require('dotenv').config()
const router = express.Router()

//must use body parser for decoding the params from the url
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//user registration
router.post('/caseRegistrationV2', businessLogic.caseRegistrationV2)

router.post('/caseRegistration', businessLogic.caseRegistration)


//pdf generation
router.get('/generatePdf', businessLogic.pdfGeneratiion)

//get cases
router.get('/getCaseRegistrationV2', businessLogic.getCaseRegistrationV2)

router.get('/getCaseRegistration', businessLogic.getCaseRegistration)

//filters
router.get('/dashBoardFilterV2', businessLogic.dashBoardFilterV2)

router.get('/dashBoardFilter', businessLogic.dashBoardFilter)

//filters
router.get('/myWorkFilter', businessLogic.myWorkFilter)

//myworks summary
router.get('/myWorksSummary', businessLogic.getMyWorksSummary)

//filters
router.get('/getAllJobStatus', businessLogic.getJobStatus)

//filters
router.get('/getAllAssetStatus', businessLogic.getAssetStatus)

//filters
router.get('/getAllPaymentStatus', businessLogic.getPaymentStatus)

//dash board edit
router.get('/dashBoardEditV2', businessLogic.dashBoardEditV2)

router.get('/dashBoardEdit', businessLogic.dashBoardEdit)

//dash board edit
router.post('/dashBoardSaveChangesV2', businessLogic.dashBoardSaveChangesV2)

router.post('/dashBoardSaveChanges', businessLogic.dashBoardSaveChanges)

//dash board delete
router.post('/dashBoardCaseDelete', businessLogic.dashBoardCaseDelete)

//work flow all works
router.get('/workFlowGetAllWorks', businessLogic.workFlowGetAllWorksv2)

//work flow all works
router.get('/workFlowGetWorkerHistory', businessLogic.workFlowGetWorkerHistoryv2)

//users get all users
router.get('/usersGetAlllUsers', businessLogic.usersGetAlllUsers)

//users get all users
router.post('/usersUpdateUser', businessLogic.usersUpdateUser)

//users terminate user
router.post('/usersTerminateAccount', businessLogic.usersTerminateAccount)

//open work assigned work
router.get('/openWorkGetAssignedWork', businessLogic.openWorkGetAssignedWork)

//open work assigned work
router.get('/experianceCustomerDetails', businessLogic.experianceCustomerDetails)

//experince api for customer from phone number  
router.get('/experianceCustomerFromPhone', businessLogic.experianceCustomerDetailsfromPhone)

//open work assigned work
router.get('/experianceCustomerItem', businessLogic.experianceCustomerItem)

//open work assigned work
router.get('/experianceCustomerBrand', businessLogic.experianceCustomerBrand)

//open work assigned work
router.get('/experianceCustomerModel', businessLogic.experianceCustomerModel)

//open work assigned work
router.get('/experianceCustomerAssigne', businessLogic.experianceCustomerAssigne)

//open work assigned work
router.get('/experianceCustomerCaseId', businessLogic.experianceCustomerCaseId)

router.get('/experianceCustomerSerialNumber', businessLogic.experianceCustomerSerialNumber);

//open work assigned work
router.get('/experiancePhoneNumber', businessLogic.experiancePhoneNumber)

//xl export
router.get('/exportXl', businessLogic.exportXl)

//phase 2 routes
//inventory return
router.get('/inventoryGetAllProductWithPartNo', businessLogic.inventoryGetProductWithPartNo)

//inventory add new product
router.post('/inventoryAddNewProduct', businessLogic.inventoryAddProduct)

//inventory update product
router.post('/inventoryUpdateproduct', businessLogic.inventoryUpdateProduct)

//inventory return
router.post('/inventoryReturn', businessLogic.inventoryReturn)

//inventory return
router.post('/inventoryPosSail', businessLogic.inventoryPOSSail)

//inventory return
router.post('/inventoryPosReturn', businessLogic.inventoryPOSReturn)

//inventory return
router.post('/coreV1AddNewParty', businessLogic.addNewParty)

//inventory return
router.post('/V1/ChangeCaseStatus', businessLogic.changeCaseStatusV1)

//inventory return
router.get('/inventoryPosGetProduct', businessLogic.inventoryPOSRGetProduct)

//inventory return
router.get('/inventoryGetAllProductLists', businessLogic.inventoryGetProductList)

//inventory return
router.get('/inventoryGetAllProductWithPartNo', businessLogic.inventoryGetProductWithPartNo)

//Automatic case id 
router.get('/createCaseId', businessLogic.CreateCaseId)

//Automatic case id flag
router.get('/caseIdChangeStatus', businessLogic.caseIdStatus)

//Automatic case check status
router.get('/caseIdCheckStatus', businessLogic.caseIdCheckStatus)

//Automatic case GENERATE NEW
router.get('/caseIdGenerateNewCaseId', businessLogic.caseIdGenerateNew)

//Automatic case GENERATE NEW
router.get('/caseIdUpdateNewCaseId', businessLogic.caseIdUpdateCaseId)

//Automatic case GENERATE NEW
router.get('/generateBarCode', businessLogic.generateBarCode)

//Automatic case GENERATE NEW
router.get('/getBarcodeDetails', businessLogic.getBarcodeDetails)

//Automatic case GENERATE NEW
router.post('/updateBarcodeDetails', businessLogic.updateBarcodeDetails)

//experiance 
router.get('/experianceInventoryProductName', businessLogic.experianceProductName)

//experiance 
router.get('/experianceDealersDelerName', businessLogic.experianceDealerName)

//experience
router.get('/coreV1experiencecustomername',businessLogic.experiencecustomername)

//create new Partner
router.post('/corev1CreateNewPartner' , businessLogic.createnewpartner)

//get partner details
router.get('/coreV1GetPartnerList' , businessLogic.getpartnerlist)

//view edit partner
router.get('/corev1ViewPartner',businessLogic.viewpartner)

//experience partner name
router.get('/corev1experiencepartner',businessLogic.experiencepartner)

//experience courier name
router.get('/corev1experiencecourier',businessLogic.experiencecourier)

//Experience order  id
router.get('/corev1experiencecourierpartner',businessLogic.experiencecourierpartner)

//experience partner name
router.get('/V1/GetJobSummary',businessLogic.getCaseSummary)

//update partner
router.post('/corev1UpdatePartner',businessLogic.updatepartner)

router.post('/api/v1/sendJobReminder',businessLogic.sendJobReminder)

router.get('/corev1ExportPartnerXl', businessLogic.exportBusinessPartnerExcel);

router.get('/corev1ExportWorkflow', businessLogic.exportWorkflow);

router.get('/corev1ExportWorkflowHistory', businessLogic.exportWorkFlowHistory);

router.get('/corev1ExportMyWorks', businessLogic.exportMyWorks);

router.post('/v1/api/generateBill', businessLogic.generateBill);

router.get("/v1/api/getBillStatus", businessLogic.getBillStatus);

router.get('/CoreV1ExperienceIssue',businessLogic.experianceissue)

router.get('/CoreV1ExperienceSupportEquipment',businessLogic.experiancesupport)

router.get('/v1/api/getUserActivityPolicy',businessLogic.userPlolicyDetails)

router.get('/v1/api/getNotificationStatus',businessLogic.notificationCrditCheck)

router.get('/v1/api/getMessageTarrif',businessLogic.getMessageTarrif)

//create work order
router.post('/v1/api/createWorkOrder', businessLogic.createWorkOrder)

router.post('/v1/api/updateNotificationCredit', businessLogic.notificationCreditUpdate)

//get work order list
router.get('/V1/api/getWorkOrderList', businessLogic.getWorkOrderList)

//update work order status
router.post('/v1/api/updateWorkOrderStatus', businessLogic.updateWorkOrderStatus)

//repair case pic removal
router.post('/coreV1RemoveRepairImage' , businessLogic.removeRepairImage)

//repair case pic removal
router.post('/coreV1UploadRepairImage' , businessLogic.uploadRepairImage)

//update party details api
router.post('/coreV1updatePartyDetails', businessLogic.updatePartyDetails);

//Customer Support API
router.post('/coreV1SubmitCustomerForm' , businessLogic.createCustomerSupport);

//customer;list
router.get('/coreV1GetCustomerList',businessLogic.getcustomerlist);

//Create Customer Detail
router.post('/corev1CreateNewCustomer',businessLogic.createnewcustomer);

//Update Customer
router.post("/corev1UpdateCustomer",businessLogic.updatecustomer)

//Update Customer
router.post("/api/v1/upadteJobSheetPayment",businessLogic.paymentInsertion)

//View Customer
router.get('/corev1ViewCustomer',businessLogic.viewpartner)

router.post('/coreV1InsertReceivedSerialNumber',businessLogic.insertReceivedSerialNumberV1);

router.get('/coreV1Getjobtotal',businessLogic.getgrandtotal)

router.get('/rptprofitlist',businessLogic.getSaleProfitlist)

router.get('/rptprofitsummary',businessLogic.profitrptSummary)

router.get('/rptplreportexcel',businessLogic.generatePLReportExcel)

router.get('/api/v1/users/farmAgents',businessLogic.getAvailableFarmAgents)

router.get('/api/v1/directPartners/users',businessLogic.getAttachedUsersFromDirectPartner)

router.post('/api/v1/users/attachToDirectPatner',businessLogic.attachUserToDirectPartner)

router.post('/api/v1/users/detachFromDirectPartner',businessLogic.detachUserFromDirectPartner)



//exporting
module.exports = router;