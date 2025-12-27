const express = require('express')
const app = express()
const bodyParser = require('body-parser')
//const moment = require('moment')
//const date = moment()
const pool = require('../models/dataBseAdapter')
const logger = require('../utils/logger')
const rptService = require('../controller/reportService')
require('dotenv').config()
const router = express.Router()

//must use body parser for decoding the params from the url
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


//weekly count
router.get('/jobCountWeekly',rptService.jobCountWeekly)

//revenue report global
router.get('/rptRevenue',rptService.revenueReport)

//employee summary report
router.get('/rptEmployeeSummary',rptService.emplyeeReport)

//employee summary report
router.post('/rptCreateEvent',rptService.createEvents)

//Get Case life cycle
router.get('/rptGetCaseLifeCycle',rptService.GetLifeCycle)

//Get Case life cycle
router.get('/GetGrowthValue',rptService.growthReport)

//exporting
module.exports = router;