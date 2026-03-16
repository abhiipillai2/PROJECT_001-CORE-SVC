const express = require('express')
const app = express()
const bodyParser = require('body-parser')
//const moment = require('moment')
//const date = moment()
const pool = require('../models/dataBseAdapter')
const logger = require('../utils/logger')
const masterController = require('../controller/userManagementClr')
require('dotenv').config()
const router = express.Router()

//must use body parser for decoding the params from the url
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


//user registration
router.post('/masterUserRegistration', masterController.MasterUserRegistration)

//relam registration
router.post('/realamRegistration', masterController.realamRegistration)

//user login
router.post('/userLogin', masterController.userLogin)

//mobile user login
router.post("/userLoginMobile", masterController.mobileUserLogin);

//user logOut
router.post('/userLogOut', masterController.userLogOut)

//user status
router.get('/userStatus', masterController.userStatus)

//user status
router.get('/mobileUserStatus', masterController.mobileUserStatus)

//user details
router.get('/userDetails', masterController.userDetails)

//user role
router.get('/userRole', masterController.userRole)


//user role
router.post('/updateRealam', masterController.updateRealam)

//get realam
router.get('/getRealam', masterController.getRealam)

//get realam
router.get('/api/v1/getRealamStatus', masterController.getReamStatus)

//get realam
router.get('/api/v1/getTermsAndConditions', masterController.getTermsAndCondition)

//get realam
router.post('/usersResetPassword', masterController.resetPassword)

//contact form submission
router.post('/genericAdapterContactSubmission', masterController.contactFormSubmission)

//contact form submission
router.get('/coreV2UmsGetStateCode', masterController.getStateCode)

//statenames
router.get('/coreV2GetstateName' , masterController.statename)

//experince phonenuber
router.get('/coreV1Experiencephone',masterController.experiencephone)

//seal pic removal
router.post('/coreV1RemoveSeal' ,masterController.removeseal)

//otp
router.post('/coreV1GenerateOTP',masterController.generateOtp)

//validate otp
router.post('/coreV1ValidateOTP',masterController.validateOtp)

//validate otp
router.get('/v1/api/getAppVersion',masterController.getMobielAppDetails)

//exporting
module.exports = router;