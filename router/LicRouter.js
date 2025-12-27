const express = require('express')
const app = express()
const bodyParser = require('body-parser')
//const moment = require('moment')
//const date = moment()
const pool = require('../models/dataBseAdapter')
const logger = require('../utils/logger')
const licController = require('../controller/licController')
require('dotenv').config()
const router = express.Router()

//must use body parser for decoding the params from the url
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//purchase license
router.post('/licPurchaseLic',licController.purchaseLicense)

//call back
router.get('/createLicense',licController.licCreateLicense)

//get all plans
router.get('/licGetAllPlans',licController.licGetAllPlans)

//get user license status
router.get('/licLicenseStatus',licController.licGetStatus)

//get user license status
router.get('/licLicenseFromPkgCode',licController.getPlanFromCode)

//get plan abased access
router.get('/licPlanBasedAccess',licController.licGetPlanBasedAccess)

//exporting
module.exports = router;