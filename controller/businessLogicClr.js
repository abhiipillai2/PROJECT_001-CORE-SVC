const path = require('path');
const os = require('os');

const logger = require('../utils/logger');
const generatePDF = require('../utils/pdf_generator');
const queryBulder = require('../utils/filterQueryGenerator');
const pool = require('../models/dataBseAdapter');
const http = require("http");
const bcrypt = require('bcrypt');
const fs = require('fs');
const bwipjs = require('bwip-js');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const moment = require('moment');
const axios = require('axios');
const Joi = require('joi');

require('dotenv').config()
const PORT = process.env.PORT || 5080
const BASE_URL = process.env.BASE_URL 
//const PAGE_ROWS = Number(process.env.GLOBAL_PAGE_ROWS)
const NMS_URL = process.env.NMS_URL
const POS_URL = process.env.POS_URL
const INTEL_URL = process.env.INTEL_URL
const MEDIA_URL = process.env.MEDIA_URL
const sandBox = process.env.SNAND_BOX
const IMS_URL = process.env.IMS_URL;
const support_mail = process.env.support_mail;

const status = "CREATED"
const case_status = "RECEIVED"
const comments = "No comments yet."

// Use dynamic import for open package
const openPromise = import('open');

class AppError extends Error {
    constructor(message, errorCode) {
        super(message);  // Pass the message to the base Error constructor
        this.errorCode = errorCode;  // Add custom errorCode property
        this.statusCode = 400; // Optional: You can add status code (e.g., 400 for Bad Request)
    }
}

//master and slave user registration
exports.caseRegistration = async (req, res) => {
    let connection;
    try {
        logger.info("Defining Joi schema .");
        console.log("Defining Joi schema .");
        const schema = Joi.object({
            business_id: Joi.string().required(),
            realam_id: Joi.string().required(),
            party_id: Joi.number().allow(null, ""),
            customer_name: Joi.string().required(),
            phone_number: Joi.string().pattern(/^\d{10}$/).required(),
            customer_phone_alter: Joi.string().allow(null,''), // Chaining separate allow() calls
            customer_email: Joi.string().email().allow(null,''), // Chaining separate allow() calls
            billing_adress:Joi.string().allow(null,''),
            case_id: Joi.number().integer().required(),
            reference_case_id: Joi.string().allow("", null),
            item_name: Joi.string().required(),
            brand: Joi.string().allow(null,''),
            model: Joi.string().allow(null,''),
            serial_number: Joi.string().allow(null,''),
            total_bill: Joi.number().integer().allow(null,''), // Chaining separate allow() calls
            advance: Joi.number().integer().allow(null,''), // Chaining separate allow() calls
            balance: Joi.number().integer().allow(null,''), // Chaining separate allow() calls
            assigne: Joi.string().required(),
            support_equpment: Joi.string().allow(null,''), // Chaining separate allow() calls
            deviceLock:Joi.string().allow(null,''),
            issue: Joi.string().allow(null,''),
            date:Joi.string().allow(null,''),
            action_owner: Joi.string().allow(null,''),
            additional_tag_name: Joi.string().trim().allow("").optional(),
            isWorkOrder: Joi.number().valid(0, 1).default(0),
            work_order_number: Joi.string().empty(null).empty("").default("0"),
            work_order_id: Joi.number().empty(null).empty("").default(0),
        });
        logger.info("Joi schema defined successfully.");
        console.log("Joi schema defined successfully.");
        const { error } = schema.validate(req.body);
        if (error) {
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        logger.info("Request body parameters validated successfully.");
        console.log("Request body parameters validated successfully.");

        const {
            business_id,
            realam_id,
            customer_name,
            party_id,
            phone_number,
            customer_phone_alter,
            customer_email,
            billing_adress,
            case_id,
            reference_case_id,
            item_name,
            brand,
            model,
            serial_number,
            total_bill,
            advance,
            balance,
            assigne,
            support_equpment,
            deviceLock,
            issue,
            date,
            action_owner,
            isWorkOrder,
            work_order_number,
            work_order_id
        } = req.body;
        logger.info(req.body);
        console.log(req.body);
        let formattedTimestamp = date
        let buyer_id = 0

        //for mobile app temp
        let isWorkOrderBkp = 0
        if(!isWorkOrder){
            isWorkOrderBkp = 0
        }else{
            isWorkOrderBkp = isWorkOrder
        }
        if(date == ""){
            logger.info('Empty date received, assigning current timestamp.');
            console.log('Empty date received, assigning current timestamp.');
            formattedTimestamp = moment().format('YYYY-MM-DD HH:mm:ss');
            logger.info(`The time stamp is ${formattedTimestamp}`);
            console.log(`The time stamp is ${formattedTimestamp}`);
        }

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection();
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        //user activity check
        const GET_USER_ACTIVITY_POLICY = `${BASE_URL}/v1/api/getUserActivityPolicy`
        async function fetchUserPolicy() {
            try {
                logger.info(`Fetching user policy from API: ${GET_USER_ACTIVITY_POLICY} for business_id: ${business_id}`);
                console.log(`Fetching user policye from API: ${GET_USER_ACTIVITY_POLICY} for business_id: ${business_id}`);

                const response = await axios.get(`${GET_USER_ACTIVITY_POLICY}?event=CORE_JOB_SHEET&business_id=${business_id}`);

                if (response.data?.statusCode?.code === "SC000") {

                    logger.info(`Successfully fetched user policy: ${JSON.stringify(response.data.param)}`);
                    console.log(`Successfully fetched user policy: ${JSON.stringify(response.data.param)}`);
                    return response.data.param;
                } else {
                    logger.error(`Error in API response: ${JSON.stringify(response.data)}`);
                    console.error(`Error in API response: ${JSON.stringify(response.data)}`);
                    throw new Error(response.data.message || "Invalid response from user policye");
                }
            } catch (error) {
                logger.error(`Error fetching user policy: ${error.message}`);
                console.error(`Error fetching user policy: ${error.message}`);
                throw new Error(error.response?.data?.message || "Failed to fetch user policy");
            }
        }
        const userPolicy = await fetchUserPolicy();

        if(userPolicy.isCheck == 1){
            //couting cases
            const [thisMonthCaseCount] = await connection.query(
                "SELECT count(*) AS current_count FROM `case_registry` WHERE business_id = ? AND `date` BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE());",
                [business_id]
            );

            if(thisMonthCaseCount[0].current_count >= userPolicy.limit){
                //Blocking the user from the action
                logger.error(`User exceed the free limit`);
                console.error(`User exceed the free limit`);
                throw new Error("You’ve reached your free quota for this month. Upgrade to a premium plan to keep enjoying uninterrupted access");
            }
        }
        //Use policy action completed
        // Check for duplicate case_id
        logger.info("Check for duplicate case_id.");
        console.log("Check for duplicate case_id.");
        const [existingCase] = await connection.query(
            'SELECT * FROM `case_registry` WHERE case_id = ? AND business_id = ?',
            [case_id, business_id]
        );
        logger.info(`Fetched ${existingCase.length} case id successfully.`);
        console.log(`Fetched ${existingCase.length} case id successfully.`);
        logger.info(existingCase)
        console.log(existingCase)

        if (existingCase.length > 0) {
            throw new Error('Duplicate CASE ID not allowed');
        }

        //check assignee
        const [existingAssigne] = await connection.query(
            'SELECT * FROM `master-users` WHERE userName = ? AND business_id = ?',
            [assigne,business_id]
        )
        logger.info(`Fetched ${existingAssigne} existing assignee details`);
        console.log(`Fetched ${existingAssigne} existing assignee details`);
        logger.info(existingAssigne);
        console.log(existingAssigne);

        if(existingAssigne.length === 0){
            logger.error("Assigned person not found in the company for assignment.");
            console.error("Assigned person not found in the company for assignment.")
            throw new Error('Assigned person does not exist in your company')
        }
        // //Update status of Quick workorder
        // if(isWorkOrder === '1'){
        //     await connection.query(
        //         'UPDATE `core_work_order_details` SET status = ? WHERE business_id = ? AND id = ?',
        //         [2,business_id,work_order_id]
        //     )
        // }
        //Update status of Quick workorder
        if(isWorkOrderBkp === '1'){
            await connection.query(
                'UPDATE `core_work_order_details` SET status = ? WHERE business_id = ? AND id = ?',
                [2,business_id,work_order_id]
            )
        }
         // Check or create party_details
        const [existingParty] = await connection.query(
            'SELECT * FROM `party_details` WHERE phone_number = ?',
            [phone_number]
        );
        if (existingParty.length === 0) {
            logger.info('No existing party found. Inserting new party record.');
            console.log('No existing party found. Inserting new party record.');

            const [insertParty] = await connection.query(
                'INSERT INTO `party_details` (customer_name, phone_number, email, alternate_phone_number, business_id, billing_adress) VALUES (?, ?, ?, ?, ?, ?)',
                [customer_name, phone_number, customer_email, customer_phone_alter, business_id, billing_adress]
            );

            buyer_id = insertParty.insertId;

            logger.info(`New party_details inserted for phone_number: ${phone_number}`);
            console.log(`New party_details inserted for phone_number: ${phone_number}`);

            //New customer posting journals
            //calling event Api
            logger.info("Calling API for oldcustomer journal");
            console.log("Calling API for oldcustomer journal");
            const payload = {
                new_customers: 1,
                old_customers: 0,
                due_collected:0,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });
        }else{
            //old customer posting journals
            buyer_id = existingParty[0].id;
            logger.info(`Existing party found (ID: ${party_id}). Updating details if needed.`);
            console.log(`Existing party found (ID: ${party_id}). Updating details if needed.`);
            //if customer name is changed for same phone number
            await connection.query(
                `UPDATE party_details
                SET customer_name = ?, email = ?, alternate_phone_number = ?, billing_adress = ?
                WHERE id = ? AND business_id = ?`,
                [customer_name, customer_email, customer_phone_alter, billing_adress, party_id, business_id]
            );
            //calling event Api
            logger.info("Calling API for oldcustomer journal");
            console.log("Calling API for oldcustomer journal");
            const payload = {
                new_customers: 0,
                old_customers: 1,
                due_collected: 0,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });
        }
        // Insert into case_registry
        await connection.query(
            'INSERT INTO `case_registry` (party_id, customer_name, phoe_number, email, case_id,  reference_case_id, itam_name, brand, model, seial_number, issue, support_equpments, assigne, total_bill, advance, balance, business_id, date, case_completion_date, payment_mode, payment_date, customer_phone_alter,billingAdress,deviceLock, action_owner,additional_tag_name, isWorkOrder, work_order_number, work_order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?)',
            [
                buyer_id,
                customer_name,
                phone_number,
                customer_email,
                case_id,
                reference_case_id,
                item_name,
                brand,
                model,
                serial_number,
                JSON.stringify(issue),
                JSON.stringify(support_equpment),
                assigne,
                total_bill,
                advance,
                balance,
                business_id,
                formattedTimestamp,
                '00/00/0000',
                'CREDIT',
                '00/00/0000',
                customer_phone_alter,
                billing_adress,
                deviceLock,
                action_owner,
                'Additional Charges',
                isWorkOrderBkp,
                work_order_number,
                work_order_id,
            ]
        );
        logger.info(`New case inserted successfully for case_id: ${case_id}`);
        console.log(`New case inserted successfully for case_id: ${case_id}`);
        // Add entry to work_flow_management
        await connection.query(
            'INSERT INTO `work_flow_management` (case_id, business_id, assigne, status, case_status, comments, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [case_id, business_id, assigne, 'CREATED', 'RECEIVED', 'No comments yet.', formattedTimestamp]
        );
        logger.info(`Workflow entry created for case_id: ${case_id}`);
        console.log(`Workflow entry created for case_id: ${case_id}`);


        // Check or create item_information
        logger.info("Defining existingitem for check or create item information.");
        console.log("Defining existingitem for check or create item information.");
        const [existingItem] = await connection.query(
            'SELECT * FROM `item_information` WHERE item_name = ? AND brand = ? AND model = ?',
            [item_name, brand, model]
        );
        if (existingItem.length === 0) {
            logger.info("no exixsting item found. Inserting new item");
            console.log("no exixsting item found. Inserting new item");
            await connection.query(
                'INSERT INTO `item_information` (item_name, brand, model) VALUES (?, ?, ?)',
                [item_name, brand, model]
            );
            logger.info(`Inserting new item: ${item_name} | ${brand} | ${model}`);
            console.log(`Inserting new item: ${item_name} | ${brand} | ${model}`);
        }

        //core cache flag
        await connection.query(
            `UPDATE core_job_sheet_summary_details SET cache_flag = ? WHERE business_id = ?`,
            [0,business_id]
        );
        logger.info(`Cache flag reset for business_id: ${business_id}`);
        console.log(`Cache flag reset for business_id: ${business_id}`);
        // Calling Case ID API to add reference case IDs
        logger.info("Calling Case ID API to add reference case IDs.");
        console.log("Calling Case ID API to add reference case IDs.");
        axios.get(`${BASE_URL}/caseIdUpdateNewCaseId?case_id=${case_id}&business_id=${encodeURIComponent(business_id)}`)
        .then(response => {
            logger.info(`Internal API call successful for case_id: ${case_id}`);
            console.log(`Internal API call successful for case_id: ${case_id}`);
            console.log('Internal call successful:', response.data);


        })
        .catch(error => {
            logger.error(`Internal API call failed for case_id: ${case_id} - ${error.message}`);
            console.error(`Internal API call failed for case_id: ${case_id} - ${error.message}`);
            console.error('Error calling internal API:', error.message);
            if (error.response) {
                logger.error(`API response error - Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
                console.error('Response data:', error.response.data);
                console.error('Response status:', error.response.status);
            }
        });

        //calling event Api
        logger.info("Calling Event Api.");
        console.log("Calling Event Api.");
        const payload = {
            case_id: case_id,
            assigne: assigne,
            status: status,
            total_amount:total_bill,
            recived_amount:advance,
            asset_status:case_status,
            flag: 0,
            businessId: business_id,
            action_owner: action_owner
        };
        logger.info("payload created");
        console.log("Payload created");
        //calling mail sender
        axios.post(`${BASE_URL}/rptCreateEvent`, payload)
        .then(response => {
            logger.info(`Mail sender API successful for case_id: ${payload.case_id}`);
            console.log('API sent successfully:', response.data);
        })
        .catch(error => {
            logger.error(`Mail sender API failed for case_id: ${payload.case_id} - ${error.message}`);
            console.error('Error sending API:', error);
        });

        //sending meta notification
        if(sandBox == "TRUE"){

            //Testing mode
        }else{
            //checking meta flag
            const [metaFlag] = await connection.query(
                'SELECT meta_flag,compnay_name FROM `relam_master` WHERE relam_id = ?',
                [realam_id]
            );

            if (metaFlag[0].meta_flag === 1) {
                logger.error(`User enabled the meta notification so sending the notification`)

                let contactUsNumbers = ""
                //fetching shop details

                //checking buiness number is there or not
                const [business_number] = await connection.query(
                    'SELECT busines_numbers FROM `relam_master` WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE slave_id = 0 AND business_id = ?)',
                    [business_id]
                );

                 if (!business_number.length || !business_number[0].busines_numbers) {
                    logger.info("No business number is found so fetching user number")
                    const [contactNumber] = await connection.query(
                        'SELECT phone_number FROM `master-users` WHERE slave_id = 0 AND business_id = ?',
                        [business_id]
                    );

                    contactUsNumbers = contactNumber[0].phone_number
                    logger.info(`contact number set as ${contactUsNumbers}`)

                 }else{
                    contactUsNumbers = business_number[0].busines_numbers
                    logger.info(`business number is found ${contactUsNumbers}`)
                 }

                //calling nms API
                // Send meta notification notification

                //checking meta flag for customer
                const [footerFlag] = await connection.query(
                    'SELECT message_footer_flag FROM `relam_master` WHERE relam_id = (SELECT relam_id from `master-users` WHERE slave_id = 0 AND business_id = ?)',
                    [business_id]
                );

                logger.info(`Cecking footer flag as ${footerFlag[0].message_footer_flag}`);
                if(footerFlag[0].message_footer_flag === 1){
                    //sending service record
                    //calling event Api
                    logger.info("Calling intel Api.");
                    console.log("Calling intel Api.");
                    const payload = {
                        customer_name: customer_name,
                        contact_number: phone_number,
                        document_id: case_id,
                        realam_id:realam_id,
                        business_id: business_id
                    };
                    logger.info("payload created");
                    console.log("Payload created");
                    //calling mail sender
                    axios.post(`${INTEL_URL}/intel-svc/api/v1/sendServiceRecordAttachment`, payload)

                    .then(response => {
                        logger.info(`Mail sender API successful for case_id: ${payload.case_id}`);
                        console.log('API sent successfully:', response.data);
                    })

                    .catch(error => {
                        logger.error(`Mail sender API failed for case_id: ${payload.case_id} - ${error.message}`);
                        console.error('Error sending API:', error);
                    });
                }

                const re_id = `REQ${Date.now()}`;
                const payloadMeta = {
                    re_id: re_id,
                    destination_phone_number: `91${phone_number}`,
                    customer_name:customer_name,
                    template_id: "1016",
                    message_type: "text",
                    isBypass : "0",
                    media_url: "/sample/filepath",
                    business_id:business_id,
                    params:[
                            {
                                type: "text",
                                text: customer_name
                            },
                            {
                                type: "text",
                                text: case_id
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            },
                            {
                                type: "text",
                                text: item_name
                            },
                            {
                                type: "text",
                                text: JSON.stringify(issue)
                            },
                            {
                                type: "text",
                                text: formattedTimestamp
                            },
                            {
                                type: "text",
                                text: contactUsNumbers
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            }
                        ]
                    };

                    try {
                        // await axios.post(`${NMS_URL}/nms/api/v1/sendMetaNotifications`, payloadMeta);
                        await axios.post(`${NMS_URL}/nms/api/v2/sendMetaNotifications`, payloadMeta);

                        logger.info(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);
                        console.log(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);

                    } catch (metaError) {
                        logger.error("Error sending notification:", metaError);
                        console.error("Error sending notification:", metaError);
                    }

            }

        }
        res.status(200).json({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'New case created successfully',
        });
        logger.info('New case registered successfully');
        console.log("New case registered successfully");
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
        logger.info(`DB connection released`);
        console.log(`DB connection released`);
    }
};



//master and slave user registration
exports.caseRegistrationV2 = async (req, res) => {
    let connection;
    try {
        logger.info("Defining Joi schema .");
        console.log("Defining Joi schema .");
        const schema = Joi.object({
            business_id: Joi.string().required(),
            realam_id: Joi.string().required(),
            party_id: Joi.number().allow(null, ""),
            customer_name: Joi.string().required(),
            phone_number: Joi.string().pattern(/^\d{10}$/).required(),
            customer_phone_alter: Joi.string().allow(null,''), // Chaining separate allow() calls
            customer_email: Joi.string().email().allow(null,''), // Chaining separate allow() calls
            billing_adress:Joi.string().allow(null,''),
            case_id: Joi.number().integer().required(),
            reference_case_id: Joi.string().allow("", null),
            item_name: Joi.string().required(),
            brand: Joi.string().allow(null,''),
            model: Joi.string().allow(null,''),
            serial_number: Joi.string().allow(null,''),
            total_bill: Joi.number().integer().allow(null,''), // Chaining separate allow() calls
            advance: Joi.number().integer().allow(null,''), // Chaining separate allow() calls
            balance: Joi.number().integer().allow(null,''), // Chaining separate allow() calls
            assigne: Joi.string().required(),
            support_equpment: Joi.string().allow(null,''), // Chaining separate allow() calls
            deviceLock:Joi.string().allow(null,''),
            issue: Joi.string().allow(null,''),
            date:Joi.string().allow(null,''),
            action_owner: Joi.string().allow(null,''),
            additional_tag_name: Joi.string().trim().allow("").optional(),
            isWorkOrder: Joi.number().valid(0, 1).default(0),
            work_order_number: Joi.string().empty(null).empty("").default("0"),
            work_order_id: Joi.number().empty(null).empty("").default(0),
            payment_status: Joi.string().required(),
        });
        logger.info("Joi schema defined successfully.");
        console.log("Joi schema defined successfully.");

     

        const { error } = schema.validate(req.body);
        if (error) {
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        logger.info("Request body parameters validated successfully.");
        console.log("Request body parameters validated successfully.");

        const {
            business_id,
            realam_id,
            customer_name,
            party_id,
            phone_number,
            customer_phone_alter,
            customer_email,
            billing_adress,
            case_id,
            reference_case_id,
            item_name,
            brand,
            model,
            serial_number,
            total_bill,
            advance,
            balance,
            assigne,
            support_equpment,
            deviceLock,
            issue,
            date,
            action_owner,
            isWorkOrder,
            work_order_number,
            work_order_id,
            payment_status
        } = req.body;
        logger.info(req.body);
        console.log(req.body);
        let formattedTimestamp = date
        let buyer_id = 0

        //for mobile app temp
        let isWorkOrderBkp = 0
        if(!isWorkOrder){
            isWorkOrderBkp = 0
        }else{
            isWorkOrderBkp = isWorkOrder
        }
        if(date == ""){
            logger.info('Empty date received, assigning current timestamp.');
            console.log('Empty date received, assigning current timestamp.');
            formattedTimestamp = moment().format('YYYY-MM-DD HH:mm:ss');
            logger.info(`The time stamp is ${formattedTimestamp}`);
            console.log(`The time stamp is ${formattedTimestamp}`);
        }

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection();
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        //user activity check
        const GET_USER_ACTIVITY_POLICY = `${BASE_URL}/v1/api/getUserActivityPolicy`
        async function fetchUserPolicy() {
            try {
                logger.info(`Fetching user policy from API: ${GET_USER_ACTIVITY_POLICY} for business_id: ${business_id}`);
                console.log(`Fetching user policye from API: ${GET_USER_ACTIVITY_POLICY} for business_id: ${business_id}`);

                const response = await axios.get(`${GET_USER_ACTIVITY_POLICY}?event=CORE_JOB_SHEET&business_id=${business_id}`);

                if (response.data?.statusCode?.code === "SC000") {

                    logger.info(`Successfully fetched user policy: ${JSON.stringify(response.data.param)}`);
                    console.log(`Successfully fetched user policy: ${JSON.stringify(response.data.param)}`);
                    return response.data.param;
                } else {
                    logger.error(`Error in API response: ${JSON.stringify(response.data)}`);
                    console.error(`Error in API response: ${JSON.stringify(response.data)}`);
                    throw new Error(response.data.message || "Invalid response from user policye");
                }
            } catch (error) {
                logger.error(`Error fetching user policy: ${error.message}`);
                console.error(`Error fetching user policy: ${error.message}`);
                throw new Error(error.response?.data?.message || "Failed to fetch user policy");
            }
        }
        const userPolicy = await fetchUserPolicy();

        if(userPolicy.isCheck == 1){
            //couting cases
            const [thisMonthCaseCount] = await connection.query(
                "SELECT count(*) AS current_count FROM `case_registry` WHERE business_id = ? AND `date` BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE());",
                [business_id]
            );

            if(thisMonthCaseCount[0].current_count >= userPolicy.limit){
                //Blocking the user from the action
                logger.error(`User exceed the free limit`);
                console.error(`User exceed the free limit`);
                throw new Error("You’ve reached your free quota for this month. Upgrade to a premium plan to keep enjoying uninterrupted access");
            }
        }
        //Use policy action completed
        // Check for duplicate case_id
        logger.info("Check for duplicate case_id.");
        console.log("Check for duplicate case_id.");
        const [existingCase] = await connection.query(
            'SELECT * FROM `case_registry` WHERE case_id = ? AND business_id = ?',
            [case_id, business_id]
        );
        logger.info(`Fetched ${existingCase.length} case id successfully.`);
        console.log(`Fetched ${existingCase.length} case id successfully.`);
        logger.info(existingCase)
        console.log(existingCase)

        if (existingCase.length > 0) {
            throw new Error('Duplicate CASE ID not allowed');
        }

        //check assignee
        const [existingAssigne] = await connection.query(
            'SELECT * FROM `master-users` WHERE userName = ? AND business_id = ?',
            [assigne,business_id]
        )
        logger.info(`Fetched ${existingAssigne} existing assignee details`);
        console.log(`Fetched ${existingAssigne} existing assignee details`);
        logger.info(existingAssigne);
        console.log(existingAssigne);

        if(existingAssigne.length === 0){
            logger.error("Assigned person not found in the company for assignment.");
            console.error("Assigned person not found in the company for assignment.")
            throw new Error('Assigned person does not exist in your company')
        }
        // //Update status of Quick workorder
        // if(isWorkOrder === '1'){
        //     await connection.query(
        //         'UPDATE `core_work_order_details` SET status = ? WHERE business_id = ? AND id = ?',
        //         [2,business_id,work_order_id]
        //     )
        // }
        //Update status of Quick workorder
        if(isWorkOrderBkp === '1'){
            await connection.query(
                'UPDATE `core_work_order_details` SET status = ? WHERE business_id = ? AND id = ?',
                [2,business_id,work_order_id]
            )
        }
         // Check or create party_details
        const [existingParty] = await connection.query(
            'SELECT * FROM `party_details` WHERE phone_number = ?',
            [phone_number]
        );
        if (existingParty.length === 0) {
            logger.info('No existing party found. Inserting new party record.');
            console.log('No existing party found. Inserting new party record.');

            const [insertParty] = await connection.query(
                'INSERT INTO `party_details` (customer_name, phone_number, email, alternate_phone_number, business_id, billing_adress) VALUES (?, ?, ?, ?, ?, ?)',
                [customer_name, phone_number, customer_email, customer_phone_alter, business_id, billing_adress]
            );

            buyer_id = insertParty.insertId;

            logger.info(`New party_details inserted for phone_number: ${phone_number}`);
            console.log(`New party_details inserted for phone_number: ${phone_number}`);

            //New customer posting journals
            //calling event Api
            logger.info("Calling API for oldcustomer journal");
            console.log("Calling API for oldcustomer journal");
            const payload = {
                new_customers: 1,
                old_customers: 0,
                due_collected:0,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });
        }else{
            //old customer posting journals
            buyer_id = existingParty[0].id;
            logger.info(`Existing party found (ID: ${party_id}). Updating details if needed.`);
            console.log(`Existing party found (ID: ${party_id}). Updating details if needed.`);
            //if customer name is changed for same phone number
            await connection.query(
                `UPDATE party_details 
                SET customer_name = ?, email = ?, alternate_phone_number = ?, billing_adress = ? 
                WHERE id = ? AND business_id = ?`,
                [customer_name, customer_email, customer_phone_alter, billing_adress, party_id, business_id]
            );
            //calling event Api
            logger.info("Calling API for oldcustomer journal");
            console.log("Calling API for oldcustomer journal");
            const payload = {
                new_customers: 0,
                old_customers: 1,
                due_collected: 0,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });
        }
        //set payment status
        const [payment_rows] = await connection.query(`SELECT id from job_payment_status WHERE payment_status= ?`, [req.body.payment_status]);
        let payment_status_id = payment_rows[0].id;
        // Insert into case_registry
        await connection.query(
            'INSERT INTO `case_registry` (party_id, customer_name, phoe_number, email, case_id,  reference_case_id, itam_name, brand, model, seial_number, issue, support_equpments, assigne, total_bill, advance, balance, business_id, date, case_completion_date, payment_mode, payment_date, customer_phone_alter,billingAdress,deviceLock, action_owner,additional_tag_name, isWorkOrder, work_order_number, work_order_id, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                buyer_id,
                customer_name,
                phone_number,
                customer_email,
                case_id,
                reference_case_id,
                item_name,
                brand,
                model,
                serial_number,
                JSON.stringify(issue),
                JSON.stringify(support_equpment),
                assigne,
                total_bill,
                advance,
                balance,
                business_id,
                formattedTimestamp,
                '00/00/0000',
                'CREDIT',
                '00/00/0000',
                customer_phone_alter,
                billing_adress,
                deviceLock,
                action_owner,
                'Additional Charges',
                isWorkOrderBkp,
                work_order_number,
                work_order_id,
                payment_status_id
            ]
        );
        logger.info(`New case inserted successfully for case_id: ${case_id}`);
        console.log(`New case inserted successfully for case_id: ${case_id}`);
        // Add entry to work_flow_management
        await connection.query(
            'INSERT INTO `work_flow_management` (case_id, business_id, assigne, status, case_status, comments, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [case_id, business_id, assigne, 'CREATED', 'RECEIVED', 'No comments yet.', formattedTimestamp]
        );
        logger.info(`Workflow entry created for case_id: ${case_id}`);
        console.log(`Workflow entry created for case_id: ${case_id}`);


        // Check or create item_information
        logger.info("Defining existingitem for check or create item information.");
        console.log("Defining existingitem for check or create item information.");
        const [existingItem] = await connection.query(
            'SELECT * FROM `item_information` WHERE item_name = ? AND brand = ? AND model = ?',
            [item_name, brand, model]
        );
        if (existingItem.length === 0) {
            logger.info("no exixsting item found. Inserting new item");
            console.log("no exixsting item found. Inserting new item");
            await connection.query(
                'INSERT INTO `item_information` (item_name, brand, model) VALUES (?, ?, ?)',
                [item_name, brand, model]
            );
            logger.info(`Inserting new item: ${item_name} | ${brand} | ${model}`);
            console.log(`Inserting new item: ${item_name} | ${brand} | ${model}`);
        }

        //core cache flag
        await connection.query(
            `UPDATE core_job_sheet_summary_details SET cache_flag = ? WHERE business_id = ?`,
            [0,business_id]
        );
        logger.info(`Cache flag reset for business_id: ${business_id}`);
        console.log(`Cache flag reset for business_id: ${business_id}`);

        // Calling Case ID API to add reference case IDs
        logger.info("Calling Case ID API to add reference case IDs.");
        console.log("Calling Case ID API to add reference case IDs.");
        axios.get(`${BASE_URL}/caseIdUpdateNewCaseId?case_id=${case_id}&business_id=${encodeURIComponent(business_id)}`)
        .then(response => {
            logger.info(`Internal API call successful for case_id: ${case_id}`);
            console.log(`Internal API call successful for case_id: ${case_id}`);
            console.log('Internal call successful:', response.data);
            

        })
        .catch(error => {
            logger.error(`Internal API call failed for case_id: ${case_id} - ${error.message}`);
            console.error(`Internal API call failed for case_id: ${case_id} - ${error.message}`);
            console.error('Error calling internal API:', error.message);
            if (error.response) {
                logger.error(`API response error - Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);         
                console.error('Response data:', error.response.data);
                console.error('Response status:', error.response.status);
            }
        });

        //calling event Api
        logger.info("Calling Event Api.");
        console.log("Calling Event Api.");
        const payload = {
            case_id: case_id,
            assigne: assigne,
            status: status,
            total_amount:total_bill,
            recived_amount:advance,
            asset_status:case_status,
            flag: 0,
            businessId: business_id,
            action_owner: action_owner 
        };
        logger.info("payload created");
        console.log("Payload created");

        //calling mail sender
        axios.post(`${BASE_URL}/rptCreateEvent`, payload)
        .then(response => {
            logger.info(`Mail sender API successful for case_id: ${payload.case_id}`);
            console.log('API sent successfully:', response.data);
        })
        .catch(error => {
            logger.error(`Mail sender API failed for case_id: ${payload.case_id} - ${error.message}`);
            console.error('Error sending API:', error);
        });

        //payment legder API call to pos
        console.log("Calling payment ledger Api.");
        const payload_for_payment_ledger = {
            cutsomer_id: buyer_id,
            document_number: case_id,
            document_type: 6,
            grand_total:total_bill,
            received_amount:advance,
            transaction_date:formattedTimestamp,
            business_id: business_id
        };
        logger.info("payload created");
        console.log("Payload created");

        //calling mail sender
        axios.post(`${POS_URL}/api/v1/postPaymentLedgers`, payload_for_payment_ledger)
        .then(response => {
            logger.info(` payment ledger Api successful for case_id: ${payload_for_payment_ledger.case_id}`);
            console.log('API sent successfully:', response.data);
        })
        .catch(error => {
            logger.error(` payment ledger Api failed for case_id: ${payload.case_id} - ${error.message}`);
            console.error('Error sending API:', error);
        });
        //sending meta notification
        if(sandBox == "TRUE"){

            //Testing mode
        }else{
            //checking meta flag
            const [metaFlag] = await connection.query(
                'SELECT meta_flag,compnay_name FROM `relam_master` WHERE relam_id = ?',
                [realam_id]
            );
            
            if (metaFlag[0].meta_flag === 1) {
                logger.error(`User enabled the meta notification so sending the notification`)

                let contactUsNumbers = ""
                //fetching shop details

                //checking buiness number is there or not 
                const [business_number] = await connection.query(
                    'SELECT busines_numbers FROM `relam_master` WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE slave_id = 0 AND business_id = ?)',
                    [business_id]
                );
                
                 if (!business_number.length || !business_number[0].busines_numbers) {
                    logger.info("No business number is found so fetching user number")

                    const [contactNumber] = await connection.query(
                        'SELECT phone_number FROM `master-users` WHERE slave_id = 0 AND business_id = ?',
                        [business_id]
                    );

                    contactUsNumbers = contactNumber[0].phone_number
                    logger.info(`contact number set as ${contactUsNumbers}`)

                 }else{
                    contactUsNumbers = business_number[0].busines_numbers
                    logger.info(`business number is found ${contactUsNumbers}`)
                 }

                //calling nms API 
                // Send meta notification notification

                //checking meta flag for customer
                const [footerFlag] = await connection.query(
                    'SELECT message_footer_flag FROM `relam_master` WHERE relam_id = (SELECT relam_id from `master-users` WHERE slave_id = 0 AND business_id = ?)',
                    [business_id]
                );

                logger.info(`Cecking footer flag as ${footerFlag[0].message_footer_flag}`);
                if(footerFlag[0].message_footer_flag === 1){
                    //sending service record
                    //calling event Api
                    logger.info("Calling intel Api.");
                    console.log("Calling intel Api.");
                    const payload = {
                        customer_name: customer_name,
                        contact_number: phone_number,
                        document_id: case_id,
                        realam_id:realam_id,
                        business_id: business_id
                    };
                    logger.info("payload created");
                    console.log("Payload created");

                    //calling mail sender
                    axios.post(`${INTEL_URL}/intel-svc/api/v1/sendServiceRecordAttachment`, payload)

                    .then(response => {
                        logger.info(`Mail sender API successful for case_id: ${payload.case_id}`);
                        console.log('API sent successfully:', response.data);
                    })

                    .catch(error => {
                        logger.error(`Mail sender API failed for case_id: ${payload.case_id} - ${error.message}`);
                        console.error('Error sending API:', error);
                    });
                }
                
                const re_id = `REQ${Date.now()}`;
                const payloadMeta = {
                    re_id: re_id,
                    destination_phone_number: `91${phone_number}`,
                    customer_name:customer_name,
                    template_id: "1016",
                    message_type: "text",
                    isBypass : "0",
                    media_url: "/sample/filepath",
                    business_id:business_id,
                    params:[
                            {
                                type: "text",
                                text: customer_name
                            },
                            {
                                type: "text",
                                text: case_id
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            },
                            {
                                type: "text",
                                text: item_name
                            },
                            {
                                type: "text",
                                text: JSON.stringify(issue)
                            },
                            {
                                type: "text",
                                text: formattedTimestamp
                            },
                            {
                                type: "text",
                                text: contactUsNumbers
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            }
                        ]
                    };

                    try {
                        // await axios.post(`${NMS_URL}/nms/api/v1/sendMetaNotifications`, payloadMeta);
                        await axios.post(`${NMS_URL}/nms/api/v2/sendMetaNotifications`, payloadMeta);

                        logger.info(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);
                        console.log(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);

                    } catch (metaError) {
                        logger.error("Error sending notification:", metaError);
                        console.error("Error sending notification:", metaError);
                    }
                
            }

        }

        res.status(200).json({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'New case created successfully',
        });
        logger.info('New case registered successfully');
        console.log("New case registered successfully");
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
        logger.info(`DB connection released`);
        console.log(`DB connection released`);
    }
};

//generate pdf
exports.pdfGeneratiion  = async (req, res) => {
    let connection;
    try {
        // Extract and validate input
        logger.info("Defining Joi schema for validation.");
        console.log("Defining Joi schema for validation.");
        const schema = Joi.object({
            business_id: Joi.string().required(),
            realam_id: Joi.string().required(),
            case_id: Joi.number().integer().required(),
        });

         logger.info("Joi schema defined successfully.");
        console.log("Joi schema defined successfully.");

        const { error } = schema.validate(req.query);
        if (error){ 
            logger.error(`Validation failed: ${error.details[0].message}`);
            console.log(`Validation failed: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }
        const { business_id, realam_id, case_id } = req.query;
        logger.info(`Request received for PDF generation from host ${req.socket.remoteAddress}`);
        console.log(`Request received for PDF generation from host ${req.socket.remoteAddress}`);

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection();
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        // Fetch case details
        const [caseDetails] = await connection.query(
            // 'SELECT * FROM `case_registry` WHERE business_id = ? AND case_id = ?',
            `SELECT cr.*, wfm.status,wfm.case_status, wfm.comments FROM case_registry cr JOIN work_flow_management wfm ON cr.case_id = wfm.case_id AND cr.business_id = wfm.business_id
             WHERE cr.business_id = ? AND cr.case_id = ?;`, [business_id, case_id]
        );
        logger.info(`Fetched ${caseDetails} existing case details`);
        console.log(`Fetched ${caseDetails} existing case details`);
        logger.info(caseDetails);
        console.log(caseDetails);

        if (caseDetails.length === 0) {
            logger.info(`No case found for case_id: ${case_id}, business_id: ${business_id}`);
            console.log(`No case found for case_id: ${case_id}, business_id: ${business_id}`);
            throw new Error('No case found for the given case_id and business_id');
        }

        if (!caseDetails[0].comments || caseDetails[0].comments === "No comments yet.") {
            caseDetails[0].comments = "No remarks.";
        }

        const {
            customer_name,
            phoe_number: phone_number,
            email,
            billingAdress,
            case_id: fetched_case_id,
            itam_name: item_name,
            brand,
            model,
            seial_number: serial_number,
            issue,
            support_equpments,
            total_bill,
            advance,
            balance,
            date,
            status,
            case_status,
            comments
        } = caseDetails[0];
        logger.info(caseDetails[0]);
        console.log(caseDetails[0]);
        const problemDescription = issue.replace(/^"|"$/g, '');
        const auxiliaryEquipment = support_equpments.replace(/^"|"$/g, '');
        //fetch QR Code details
        const QR_code_Details = `${POS_URL}/posV1GenerateQRImage`
    
        async function fetchQRCODE() {
                try {
                    logger.info(`Fetching QR Code Details from API: ${QR_code_Details} for business_id: ${business_id}`);
                    console.log(`Fetching QR Code Details from API: ${QR_code_Details} for business_id: ${business_id}`);
    
                    const response = await axios.post(QR_code_Details,{amount: balance ,business_id:business_id});
    
                    if (response.data?.statusCode?.code === "SC000") {
    
                        logger.info(`Successfully fetched QR code: ${JSON.stringify(response.data.params)}`);
                        console.log(`Successfully fetched QR code: ${JSON.stringify(response.data.params)}`);
                        return{
                           upi_id:response.data.params[0].upi_id,
                           payee_name: response.data.params[0].payee_name,
                           QR_URL:response.data.QRPath
                        } 
                    } else {
                        logger.error(`Error in API response: ${JSON.stringify(response.data)}`);
                        console.error(`Error in API response: ${JSON.stringify(response.data)}`);
                        return {upi_id : 0 }
                    }
                } catch (error) {
                    logger.error(`Error fetching QR Details: ${error.message}`);
                    console.error(`Error fetching QR details: ${error.message}`);
                    throw new Error(error.response?.data?.message || "Failed to fetch QR Data");
                }
        }
        //checking qr code logic
        let QRImage = {}
        if(balance != 0){
            QRImage=await fetchQRCODE(); 
        }
        // Fetch company details
        const [companyDetails] = await connection.query(
            'SELECT compnay_name, profile_pic, company_address, PIN,terms_conditons,qr_flag FROM `relam_master` WHERE relam_id = ?',
            [realam_id]
        );

        if (companyDetails.length === 0) {
            logger.error(`No company found for relam_id: ${realam_id}`);
            console.error(`No company found for relam_id: ${realam_id}`);
            throw new Error('No company details found for the given realam_id');
        }

        const {
            compnay_name: companyName,
            profile_pic: companyLogo,
            company_address: address,
            PIN: pin,
            terms_conditons,
            qr_flag,
        } = companyDetails[0];
        logger.info(companyDetails[0]);
        console.log(companyDetails[0]);
        const terms = terms_conditons.split("&&").map(t => t.trim()).filter(t => t !== "").map((t, index) => `${index + 1}. ${t}`);
        const dataForPDF = {
            companyLogo,
            companyName,
            customerName: customer_name,
            customerEmail: email,
            customerPhone: phone_number,
            billingAddress: billingAdress,
            itemNo: '1',
            caseId: fetched_case_id,
            item: item_name,
            brand,
            model,
            serialNumber: serial_number,
            problemDescription,
            auxiliaryEquipment,
            estimateAmount: total_bill,
            advancedPayment: advance,
            balance,
            date,
            adress: address,
            pin,
            terms,
            qr_flag,
            status,
            case_status,
            comments,
            QR_URL:QRImage.QR_URL,
            upi_id:QRImage.upi_id,
            payee_name:QRImage.payee_name
        };
        logger.info(dataForPDF);
        console.log(dataForPDF);

        // Generate PDF
        const pdfPath = await generatePDF(dataForPDF);
        logger.info(`PDF generated successfully at: ${pdfPath}`);
        console.log(`PDF generated successfully at: ${pdfPath}`);

        // Trigger file download
        res.download(pdfPath, `summary_receipt_${fetched_case_id}.pdf`);
        logger.info('PDF generated and sent successfully');
        console.log('PDF generated and sent successfully');
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
        logger.info('Database connection released successfully');
        console.log('Database connection released successfully');
    }
};

exports.getCaseRegistration = async (req, res) => {
    let connection;
    try {
        // Extract and validate input
        const schema = Joi.object({
            business_id: Joi.string().required(),
            page_number: Joi.number().integer().required(),
            sort_by: Joi.string().allow('', null).optional(),
            sort_order: Joi.string().allow('', null).optional(),
            PAGE_ROWS: Joi.number().integer().required(),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { business_id, page_number, sort_by,  sort_order, PAGE_ROWS} = req.query;

        // Allowed sort columns
        const validSortColumns = ['date', 'case_id', 'delivery_date'];
        const validSortOrders = ['asc', 'desc'];

        // Validate column and order
        const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
        ? sort_by
        : 'case_id';

        const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
        ? sort_order.toUpperCase()
        : 'DESC';

        const count = parseInt(PAGE_ROWS,10);
        logger.info(`Request received for getting case registration from host ${req.socket.remoteAddress}`);
        console.log(`Request received for getting case registration from host ${req.socket.remoteAddress}`);


        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection();
        // Fetch paginated case registrations
        const [caseData] = await connection.query(
            `SELECT case_registry.customer_name,case_registry.case_id,case_registry.itam_name,case_registry.brand,case_registry.model,case_registry.seial_number,case_registry.total_bill,case_registry.bill_status,case_registry.advance,case_registry.document_no,case_registry.balance,case_registry.date,case_registry.delivery_date,work_flow_management.assigne,work_flow_management.status,work_flow_management.case_status FROM case_registry INNER JOIN work_flow_management ON case_registry.case_id = work_flow_management.case_id WHERE case_registry.business_id = ? AND work_flow_management.business_id = ? ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
            [business_id, business_id, count, (page_number - 1) * count]
        );

    const formattedCaseData = caseData.map(row => ({
      ...row,
      delivery_date: row.case_status === 'RECEIVED' ? '' : (row.delivery_date ? new Date(row.delivery_date).toLocaleDateString('en-CA') : '')
    }));

        // Fetch totals and counts
        const [totals] = await connection.query(
            'SELECT SUM(CAST(case_registry.total_bill AS DECIMAL(10,2))) AS totalBill, SUM(CAST(case_registry.advance AS DECIMAL(10,2))) AS totalAdvance, SUM(CAST(case_registry.balance AS DECIMAL(10,2))) AS totalBalance, COUNT(DISTINCT case_registry.case_id) AS totalCases FROM case_registry INNER JOIN work_flow_management ON case_registry.case_id = work_flow_management.case_id WHERE case_registry.business_id = ? AND work_flow_management.business_id = ?',
            [business_id,business_id]
        );

        const totalsAndCounts = {
            totalBill: totals[0]?.totalBill || 0,
            totalAdvance: totals[0]?.totalAdvance || 0,
            totalBalance: totals[0]?.totalBalance || 0,
            totalCases: totals[0]?.totalCases || 0,
        };

        res.status(200).json({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'Got case registrations',
            param: {
                page_data: formattedCaseData,
                total_and_count: totalsAndCounts,
            },
        });

        logger.info(`Fetched case registrations successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
        console.log(`Fetched case registrations successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
        logger.info('Database connection released successfully');
        console.log('Database connection released successfully');
    }
};

exports.getCaseRegistrationV2 = async (req, res) => {
    let connection;
    try {
        // Extract and validate input
        const schema = Joi.object({
            business_id: Joi.string().required(),
            page_number: Joi.number().integer().required(),
            sort_by: Joi.string().allow('', null).optional(),
            sort_order: Joi.string().allow('', null).optional(),
            PAGE_ROWS: Joi.number().integer().required(),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { business_id, page_number, sort_by,  sort_order, PAGE_ROWS} = req.query;

        // Allowed sort columns
        const validSortColumns = ['date', 'case_id', 'delivery_date'];
        const validSortOrders = ['asc', 'desc'];

        // Validate column and order
        const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
        ? sort_by
        : 'case_id';

        const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
        ? sort_order.toUpperCase()
        : 'DESC';
        
        const count = parseInt(PAGE_ROWS,10);
        logger.info(`Request received for getting case registration from host ${req.socket.remoteAddress}`);
        console.log(`Request received for getting case registration from host ${req.socket.remoteAddress}`);


        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection();

        // Fetch paginated case registrations
        const [caseData] = await connection.query(
            `SELECT case_registry.customer_name,case_registry.case_id,case_registry.itam_name,case_registry.brand,case_registry.model,case_registry.seial_number,case_registry.total_bill,case_registry.bill_status,case_registry.advance,case_registry.document_no,case_registry.balance,case_registry.date,case_registry.delivery_date,case_registry.payment_status,work_flow_management.assigne,work_flow_management.status,work_flow_management.case_status FROM case_registry INNER JOIN work_flow_management ON case_registry.case_id = work_flow_management.case_id WHERE case_registry.business_id = ? AND work_flow_management.business_id = ? ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
            [business_id, business_id, count, (page_number - 1) * count]
        );

    const formattedCaseData = caseData.map(row => ({
      ...row,
      delivery_date: row.case_status === 'RECEIVED' ? '' : (row.delivery_date ? new Date(row.delivery_date).toLocaleDateString('en-CA') : '')
    }));

        // Fetch totals and counts
        const [totals] = await connection.query(
            'SELECT SUM(CAST(case_registry.total_bill AS DECIMAL(10,2))) AS totalBill, SUM(CAST(case_registry.advance AS DECIMAL(10,2))) AS totalAdvance, SUM(CAST(case_registry.balance AS DECIMAL(10,2))) AS totalBalance, COUNT(DISTINCT case_registry.case_id) AS totalCases FROM case_registry INNER JOIN work_flow_management ON case_registry.case_id = work_flow_management.case_id WHERE case_registry.business_id = ? AND work_flow_management.business_id = ?',
            [business_id,business_id]
        );

        const totalsAndCounts = {
            totalBill: totals[0]?.totalBill || 0,
            totalAdvance: totals[0]?.totalAdvance || 0,
            totalBalance: totals[0]?.totalBalance || 0,
            totalCases: totals[0]?.totalCases || 0,
        };

        res.status(200).json({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'Got case registrations',
            param: {
                page_data: formattedCaseData,
                total_and_count: totalsAndCounts,
            },
        });

        logger.info(`Fetched case registrations successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
        console.log(`Fetched case registrations successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
        logger.info('Database connection released successfully');
        console.log('Database connection released successfully');
    }
};

//dashboard filter
exports.dashBoardFilter = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
            fromDate: Joi.date().allow('', null).optional(),
            endDate: Joi.date().allow('', null).optional(),
            customerName: Joi.string().allow('', null).optional(),
            caseId: Joi.number().integer().allow('', null).optional(),
            jobStatus: Joi.string().allow('', null).optional(),
            assetStatus: Joi.string().allow('', null).optional(),
            phone_number: Joi.string().pattern(/^[0-9]{10}$/).allow('', null).optional(),
            serialNumber: Joi.string().allow('', null).optional(),
            deliveryDate: Joi.date().allow('', null).optional(),
            business_id: Joi.string().required(),
            page_number: Joi.number().integer().required(),
            sort_by: Joi.string().allow('', null).optional(),
            sort_order: Joi.string().allow('', null).optional(),
            PAGE_ROWS: Joi.number().integer().required(),
            engineerName: Joi.string().allow('', null).optional(),
        });

        const { error } = schema.validate(req.query);
        if (error){
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
             throw new Error(`Validation Error: ${error.details[0].message}`);
        }
        const {
            fromDate,
            endDate,
            customerName,
            caseId,
            jobStatus,
            assetStatus,
            phone_number,
            serialNumber,
            deliveryDate,
            business_id,
            page_number,
            sort_by,
            sort_order,
            PAGE_ROWS,
            engineerName
        } = req.query;
        logger.info(req.query);
        console.log(req.query);

        const count = parseInt(PAGE_ROWS,10);
        logger.info(`Request received for dashboard filter from host ${req.socket.remoteAddress}`);
        console.log(`Request received for dashboard filter from host ${req.socket.remoteAddress}`);

        // Allowed sort columns
        const validSortColumns = ['date', 'case_id', 'delivery_date'];
        const validSortOrders = ['asc', 'desc'];

        // Validate column and order
        const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
        ? sort_by
        : 'case_id';

        const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
        ? sort_order.toUpperCase()
        : 'DESC';

        // Validate presence of at least one filter parameter
        if (!fromDate && !endDate && !customerName && !caseId && !jobStatus && !assetStatus && !phone_number && !serialNumber && !deliveryDate && !engineerName) {
            logger.error('At least one valid parameter is required for filtering');
            console.error('At least one valid parameter is required for filtering');
            throw new Error('At least one valid parameter is required for filtering');

        }

        // Build query conditions
        const queryConditions = [];
        const queryParams = [];
        logger.info('Initializing dynamic query conditions and parameters arrays');
        console.log('Initializing dynamic query conditions and parameters arrays');

        if (fromDate) {
            logger.info(`Adding fromDate filter to query: ${fromDate}`);
            console.log(`Adding fromDate filter to query: ${fromDate}`);
            queryConditions.push("DATE(`case_registry`.date) >= ?");
            queryParams.push(fromDate);
            logger.info(`Query condition added successfully for fromDate: ${fromDate}`);
            console.log(`Query condition added successfully for fromDate: ${fromDate}`);
        }
        if (endDate) {
            logger.info(`Adding endDate filter: ${endDate}`);
            console.log(`Adding endDate filter: ${endDate}`);
            queryConditions.push("DATE(`case_registry`.date) <= ?");
            queryParams.push(endDate);
            logger.info(`endDate filter added successfully`);
            console.log(`endDate filter added successfully`);
        }
        if (customerName) {
            logger.info(`Adding customerName filter: ${customerName}`);
            console.log(`Adding customerName filter: ${customerName}`);
            queryConditions.push("`case_registry`.customer_name LIKE CONCAT('%', ?, '%')");
            queryParams.push(customerName);
            logger.info(`customerName filter added successfully`);
            console.log(`customerName filter added successfully`);
        }
        if (caseId) {
            logger.info(`Adding caseId filter: ${caseId}`);
            console.log(`Adding caseId filter: ${caseId}`);
            queryConditions.push("`case_registry`.case_id = ?");
            queryParams.push(caseId);
            logger.info(`caseId filter added successfully`);
            console.log(`caseId filter added successfully`);
        }
        if (serialNumber) {
            logger.info(`Adding serialNumber filter: ${serialNumber}`);
            console.log(`Adding serialNumber filter: ${serialNumber}`);
            queryConditions.push("`case_registry`.seial_number LIKE CONCAT('%', ?, '%')");
            queryParams.push(serialNumber);
            logger.info(`serialNumber filter added successfully`);
            console.log(`serialNumber filter added successfully`);
        }
        if (jobStatus) {
            logger.info(`Adding jobStatus filter: ${jobStatus}`);
            console.log(`Adding jobStatus filter: ${jobStatus}`);
            queryConditions.push("`work_flow_management`.status = ?");
            queryParams.push(jobStatus);
            logger.info(`jobStatus filter added successfully`);
            console.log(`jobStatus filter added successfully`);
        }
        if (assetStatus) {
            logger.info(`Adding assetStatus filter: ${assetStatus}`);
            console.log(`Adding assetStatus filter: ${assetStatus}`);
            queryConditions.push("`work_flow_management`.case_status = ?");
            queryParams.push(assetStatus);
            logger.info(`assetStatus filter added successfully`);
            console.log(`assetStatus filter added successfully`);

        }
        if (phone_number) {
            logger.info(`Adding phone_number filter: ${phone_number}`);
            console.log(`Adding phone_number filter: ${phone_number}`);
            queryConditions.push("`case_registry`.phoe_number = ?");
            queryParams.push(phone_number);
            logger.info(`phone_number filter added successfully`);
            console.log(`[phone_number filter added successfully`);
        }
        if (deliveryDate) {
            queryConditions.push("DATE(`case_registry`.delivery_date) = ?");
            queryParams.push(deliveryDate);
        }
        if (engineerName) {
            logger.info(`Adding engineerName filter: ${engineerName}`);
            console.log(`Adding engineerName filter: ${engineerName}`);
            queryConditions.push("`work_flow_management`.assigne LIKE CONCAT('%', ?, '%')");
            queryParams.push(engineerName);
            logger.info(`engineerName filter added successfully`);
            console.log(`engineerName filter added successfully`);
        }

        // Create query condition string by joining the conditions with 'AND'
        const queryConditionString = queryConditions.length > 0 ? queryConditions.join(' AND ') : '1'; // Default to '1' if no conditions
        logger.info('Constructed query condition string', {queryConditionString});
        console.log('Constructed query condition string', {queryConditionString});
        // Query for paginated data
        const paginatedQuery =
            `SELECT \`case_registry\`.customer_name, \`case_registry\`.case_id, \`case_registry\`.itam_name,
            \`case_registry\`.brand, \`case_registry\`.seial_number, \`case_registry\`.model, \`case_registry\`.total_bill, \`case_registry\`.document_no,
            \`case_registry\`.advance, \`case_registry\`.balance, \`case_registry\`.date, \`case_registry\`.delivery_date,\`case_registry\`.bill_status, \`work_flow_management\`.assigne,
            \`work_flow_management\`.status, \`work_flow_management\`.case_status
            FROM \`case_registry\`
            INNER JOIN \`work_flow_management\` ON \`case_registry\`.case_id = \`work_flow_management\`.case_id
            WHERE ${queryConditionString} AND \`case_registry\`.business_id = ? AND \`work_flow_management\`.business_id = ?
            ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;

        logger.info('Constructed paginated query for case registry', {query: paginatedQuery,conditionString: queryConditionString});
        console.log('Constructed paginated query for case registry', {query: paginatedQuery,conditionString: queryConditionString});

        const paginatedParams = [...queryParams, business_id, business_id, count, (page_number - 1) * count];

        logger.info('Prepared parameters for paginated query', {paginatedParams});
        console.log('Prepared parameters for paginated query', {paginatedParams});
        // Query for totals
        const totalsQuery =
            `SELECT SUM(CAST(\`case_registry\`.total_bill AS DECIMAL(10,2))) AS totalBill,
            SUM(CAST(\`case_registry\`.advance AS DECIMAL(10,2))) AS totalAdvance,
            SUM(CAST(\`case_registry\`.balance AS DECIMAL(10,2))) AS totalBalance,
            COUNT(DISTINCT \`case_registry\`.case_id) AS totalCases
            FROM \`case_registry\`
            INNER JOIN \`work_flow_management\` ON \`case_registry\`.case_id = \`work_flow_management\`.case_id
            WHERE ${queryConditionString} AND \`case_registry\`.business_id = ? AND \`work_flow_management\`.business_id = ?`;
                                                                                                                                 
        logger.info('Constructed Query for totals', {query: totalsQuery,conditionString: queryConditionString});
        console.log('Constructed Query for totals', {query: totalsQuery,conditionString: queryConditionString});

        const totalsParams = [...queryParams, business_id, business_id];
        logger.info('Prepared parameters for totals query', { totalsParams });
        console.log('Prepared parameters for totals query', { totalsParams });

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection();
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        logger.info('Executing paginated query for case data', {query: paginatedQuery,params: paginatedParams});
        console.log('Executing paginated query for case data', {query: paginatedQuery,params: paginatedParams});
        const [pageData] = await connection.query(paginatedQuery, paginatedParams);
        logger.info("Paginated case data fetched successfully");
        console.log("Paginated case data fetched successfully");

        const formattedPageData = pageData.map(row => ({
        ...row,
            delivery_date: (row.case_status === "RECEIVED")
                ? ""   // force empty if RECEIVED
                : (row.delivery_date
                    ? new Date(row.delivery_date).toLocaleDateString('en-CA')
                    : "")
        }));

        logger.info('Executing totals query', {query: totalsQuery,params: totalsParams});
        console.log('Executing totals query', {query: totalsQuery,params: totalsParams});
        const [totals] = await connection.query(totalsQuery, totalsParams);
        logger.info("Fetched totals successfully");
        console.log("Fetched totals successfully");
        const totalsAndCounts = {
            totalBill: totals[0]?.totalBill || 0,
            totalAdvance: totals[0]?.totalAdvance || 0,
            totalBalance: totals[0]?.totalBalance || 0,
            totalCases: totals[0]?.totalCases || 0,
        };
        logger.info('Totals fetched and parsed', totalsAndCounts);
        console.log('Totals fetched and parsed', totalsAndCounts);

        res.status(200).json({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'Dashboard data retrieved successfully',
            param: {
                page_data: formattedPageData,
                total_and_count: totalsAndCounts,
            },
        });

        logger.info(`Fetched dashboard data successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
        console.log(`Fetched dashboard data successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};

//dashboard filter
exports.dashBoardFilterV2 = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
            fromDate: Joi.date().allow('', null).optional(),
            endDate: Joi.date().allow('', null).optional(),
            customerName: Joi.string().allow('', null).optional(),
            caseId: Joi.number().integer().allow('', null).optional(),
            jobStatus: Joi.string().allow('', null).optional(),
            assetStatus: Joi.string().allow('', null).optional(),
            phone_number: Joi.string().pattern(/^[0-9]{10}$/).allow('', null).optional(),
            serialNumber: Joi.string().allow('', null).optional(),
            deliveryDate: Joi.date().allow('', null).optional(),
            business_id: Joi.string().required(),
            page_number: Joi.number().integer().required(),
            sort_by: Joi.string().allow('', null).optional(),
            sort_order: Joi.string().allow('', null).optional(),
            PAGE_ROWS: Joi.number().integer().required(),
            engineerName: Joi.string().allow('', null).optional(),
            paymentStatus: Joi.string().allow('', null).optional(),
            received_serial_number: Joi.string().allow('', null).optional(),
        });

        const { error } = schema.validate(req.query);
        if (error){
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
             throw new Error(`Validation Error: ${error.details[0].message}`);
        }
        const {
            fromDate,
            endDate,
            customerName,
            caseId,
            jobStatus,
            assetStatus,
            phone_number,
            serialNumber,
            deliveryDate,
            business_id,
            page_number,
            sort_by,
            sort_order,
            PAGE_ROWS,
            engineerName,
            paymentStatus,
            received_serial_number
        } = req.query;
        logger.info(req.query);
        console.log(req.query);
    
        const count = parseInt(PAGE_ROWS,10);
        logger.info(`Request received for dashboard filter from host ${req.socket.remoteAddress}`);
        console.log(`Request received for dashboard filter from host ${req.socket.remoteAddress}`);

        // Allowed sort columns
        const validSortColumns = ['date', 'case_id', 'delivery_date'];
        const validSortOrders = ['asc', 'desc'];

        // Validate column and order
        const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
        ? sort_by
        : 'case_id';

        const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
        ? sort_order.toUpperCase()
        : 'DESC';

        // Validate presence of at least one filter parameter
        if (!fromDate && !endDate && !customerName && !caseId && !jobStatus && !assetStatus && !phone_number && !serialNumber && !deliveryDate && !engineerName  && !received_serial_number && !paymentStatus) {
            logger.error('At least one valid parameter is required for filtering');
            console.error('At least one valid parameter is required for filtering');
            throw new Error('At least one valid parameter is required for filtering');

        }

        // Build query conditions
        const queryConditions = [];
        const queryParams = [];
        logger.info('Initializing dynamic query conditions and parameters arrays');
        console.log('Initializing dynamic query conditions and parameters arrays');

        if (fromDate) {
            logger.info(`Adding fromDate filter to query: ${fromDate}`);
            console.log(`Adding fromDate filter to query: ${fromDate}`);
            if (deliveryDate) {
                queryConditions.push("DATE(`case_registry`.delivery_date) >= ?");
                console.log("From date for delivery date is selected.");
                logger.info("From date for delivery date is selected.");
            } else {
                queryConditions.push("DATE(`case_registry`.date) >= ?");
                console.log("From date for service date is selected.");
                logger.info("From date for service date is selected.");
            }
            queryParams.push(fromDate);
            logger.info(`Query condition added successfully for fromDate: ${fromDate}`);
            console.log(`Query condition added successfully for fromDate: ${fromDate}`);
        }
        if (endDate) {
            logger.info(`Adding endDate filter: ${endDate}`);
            console.log(`Adding endDate filter: ${endDate}`);
            if (deliveryDate) {
                queryConditions.push("DATE(`case_registry`.delivery_date) <= ?");
                console.log("End date for delivery date is selected.");
                logger.info("End date for delivery date is selected.");
            } else {
                queryConditions.push("DATE(`case_registry`.date) <= ?");
                console.log("End date for service date is selected.");
                logger.info("End date for service date is selected.");
            }
            queryParams.push(endDate);
            logger.info(`endDate filter added successfully`);
            console.log(`endDate filter added successfully`);
        }
        if (customerName) {
            logger.info(`Adding customerName filter: ${customerName}`);
            console.log(`Adding customerName filter: ${customerName}`);
            queryConditions.push("`case_registry`.customer_name LIKE CONCAT('%', ?, '%')");
            queryParams.push(customerName);
            logger.info(`customerName filter added successfully`);
            console.log(`customerName filter added successfully`);
        }
        if (caseId) {
            logger.info(`Adding caseId filter: ${caseId}`);
            console.log(`Adding caseId filter: ${caseId}`);
            queryConditions.push("`case_registry`.case_id = ?");
            queryParams.push(caseId);
            logger.info(`caseId filter added successfully`);
            console.log(`caseId filter added successfully`);
        }
        if (serialNumber) {
            logger.info(`Adding serialNumber filter: ${serialNumber}`);
            console.log(`Adding serialNumber filter: ${serialNumber}`);
            queryConditions.push("`case_registry`.seial_number LIKE CONCAT('%', ?, '%')");
            queryParams.push(serialNumber);
            logger.info(`serialNumber filter added successfully`);
            console.log(`serialNumber filter added successfully`);
        }
        if (jobStatus) {
            logger.info(`Adding jobStatus filter: ${jobStatus}`);
            console.log(`Adding jobStatus filter: ${jobStatus}`);
            queryConditions.push("`work_flow_management`.status = ?");
            queryParams.push(jobStatus);
            logger.info(`jobStatus filter added successfully`);
            console.log(`jobStatus filter added successfully`);
        }
        if (assetStatus) {
            logger.info(`Adding assetStatus filter: ${assetStatus}`);
            console.log(`Adding assetStatus filter: ${assetStatus}`);
            queryConditions.push("`work_flow_management`.case_status = ?");
            queryParams.push(assetStatus);
            logger.info(`assetStatus filter added successfully`);
            console.log(`assetStatus filter added successfully`);

        }
        if (phone_number) {
            logger.info(`Adding phone_number filter: ${phone_number}`);
            console.log(`Adding phone_number filter: ${phone_number}`);
            queryConditions.push("`case_registry`.phoe_number = ?");
            queryParams.push(phone_number);
            logger.info(`phone_number filter added successfully`);
            console.log(`[phone_number filter added successfully`);
        }
        // if (deliveryDate) {
        //     queryConditions.push("DATE(`case_registry`.delivery_date) = ?");
        //     queryParams.push(deliveryDate);
        // }
        if (engineerName) {
            logger.info(`Adding engineerName filter: ${engineerName}`);
            console.log(`Adding engineerName filter: ${engineerName}`);
            queryConditions.push("`work_flow_management`.assigne LIKE CONCAT('%', ?, '%')");
            queryParams.push(engineerName);
            logger.info(`engineerName filter added successfully`);
            console.log(`engineerName filter added successfully`);
        }
        if (paymentStatus) {
            logger.info(`Adding paymentStatus filter: ${paymentStatus}`);
            console.log(`Adding paymentStatus filter: ${paymentStatus}`);
            queryConditions.push("`case_registry`.payment_status = ?");
            queryParams.push(paymentStatus);
            logger.info(`paymentStatus filter added successfully`); 
            console.log(`paymentStatus filter added successfully`);
        }
        if (received_serial_number) {
            logger.info(`Adding received_serial_number filter: ${received_serial_number}`);
            console.log(`Adding received_serial_number filter: ${received_serial_number}`);
            queryConditions.push("`case_registry`.received_serial_number LIKE CONCAT('%', ?, '%')");
            queryParams.push(received_serial_number);
            logger.info(`received_serial_number filter added successfully`);
            console.log(`received_serial_number filter added successfully`);
        }

        // Create query condition string by joining the conditions with 'AND'
        const queryConditionString = queryConditions.length > 0 ? queryConditions.join(' AND ') : '1'; // Default to '1' if no conditions
        logger.info('Constructed query condition string', {queryConditionString});
        console.log('Constructed query condition string', {queryConditionString});
        // Query for paginated data
        const paginatedQuery =
            `SELECT \`case_registry\`.customer_name, \`case_registry\`.case_id, \`case_registry\`.itam_name, 
            \`case_registry\`.brand, \`case_registry\`.seial_number, \`case_registry\`.model, \`case_registry\`.total_bill, \`case_registry\`.document_no, 
            \`case_registry\`.advance, \`case_registry\`.balance, \`case_registry\`.date, \`case_registry\`.delivery_date,\`case_registry\`.bill_status,\`case_registry\`.payment_status, \`work_flow_management\`.assigne, 
            \`work_flow_management\`.status, \`work_flow_management\`.case_status 
            FROM \`case_registry\` 
            INNER JOIN \`work_flow_management\` ON \`case_registry\`.case_id = \`work_flow_management\`.case_id 
            WHERE ${queryConditionString} AND \`case_registry\`.business_id = ? AND \`work_flow_management\`.business_id = ? 
            ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
 
        logger.info('Constructed paginated query for case registry', {query: paginatedQuery,conditionString: queryConditionString});
        console.log('Constructed paginated query for case registry', {query: paginatedQuery,conditionString: queryConditionString});

        const paginatedParams = [...queryParams, business_id, business_id, count, (page_number - 1) * count];

        logger.info('Prepared parameters for paginated query', {paginatedParams});
        console.log('Prepared parameters for paginated query', {paginatedParams});
        // Query for totals
        const totalsQuery = 
            `SELECT SUM(CAST(\`case_registry\`.total_bill AS DECIMAL(10,2))) AS totalBill, 
            SUM(CAST(\`case_registry\`.advance AS DECIMAL(10,2))) AS totalAdvance, 
            SUM(CAST(\`case_registry\`.balance AS DECIMAL(10,2))) AS totalBalance, 
            COUNT(DISTINCT \`case_registry\`.case_id) AS totalCases 
            FROM \`case_registry\` 
            INNER JOIN \`work_flow_management\` ON \`case_registry\`.case_id = \`work_flow_management\`.case_id 
            WHERE ${queryConditionString} AND \`case_registry\`.business_id = ? AND \`work_flow_management\`.business_id = ?`;

        logger.info('Constructed Query for totals', {query: totalsQuery,conditionString: queryConditionString});
        console.log('Constructed Query for totals', {query: totalsQuery,conditionString: queryConditionString});

        const totalsParams = [...queryParams, business_id, business_id];
        logger.info('Prepared parameters for totals query', { totalsParams });
        console.log('Prepared parameters for totals query', { totalsParams });

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection();
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        logger.info('Executing paginated query for case data', {query: paginatedQuery,params: paginatedParams});
        console.log('Executing paginated query for case data', {query: paginatedQuery,params: paginatedParams});
        const [pageData] = await connection.query(paginatedQuery, paginatedParams);
        logger.info("Paginated case data fetched successfully");
        console.log("Paginated case data fetched successfully");

        const formattedPageData = pageData.map(row => ({
        ...row,
            delivery_date: (row.case_status === "RECEIVED")
                ? ""   // force empty if RECEIVED
                : (row.delivery_date 
                    ? new Date(row.delivery_date).toLocaleDateString('en-CA') 
                    : "")
        }));

        logger.info('Executing totals query', {query: totalsQuery,params: totalsParams}); 
        console.log('Executing totals query', {query: totalsQuery,params: totalsParams});
        const [totals] = await connection.query(totalsQuery, totalsParams);
        logger.info("Fetched totals successfully");
        console.log("Fetched totals successfully");
        const totalsAndCounts = {
            totalBill: totals[0]?.totalBill || 0,
            totalAdvance: totals[0]?.totalAdvance || 0,
            totalBalance: totals[0]?.totalBalance || 0,
            totalCases: totals[0]?.totalCases || 0,
        };
        logger.info('Totals fetched and parsed', totalsAndCounts);
        console.log('Totals fetched and parsed', totalsAndCounts);

        res.status(200).json({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'Dashboard data retrieved successfully',
            param: {
                page_data: formattedPageData,
                total_and_count: totalsAndCounts,
            },
        });

        logger.info(`Fetched dashboard data successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
        console.log(`Fetched dashboard data successfully with totals: ${JSON.stringify(totalsAndCounts)}`);
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};


exports.getJobStatus = async (req, res) => {
    let connection;
    try {
        // // Input validation
        // const schema = Joi.object({
        //     business_id: Joi.string().required(),
        // });

        // const { error } = schema.validate(req.query);
        // if (error) throw new Error(`Validation Error: ${error.details[0].message}`);
        
        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection(); // Get a connection from the pool
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");
        const { business_id } = req.query;

        // Query to fetch job statuses
        const query = 'SELECT job_status_value FROM job_status;';
        logger.info('Fetching job statuses using query:', { query });
        console.log('Fetching job statuses using query:', { query });

    
        const [rows] = await connection.query(query);
        logger.info("Fetched job statuses successfully");
        console.log("Fetched job statuses successfully");

        if (rows.length > 0) {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got all job statuses",
                param: {
                    data: rows,
                },
            });
            logger.info(`Fetched ${rows.length} job statuses successfully`);
            console.log(`Fetched ${rows.length} job statuses successfully`);
        } else {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "No job statuses found for this business id",
                param: "No Data",
            });
            logger.info("No job statuses found");
            console.log("No job statuses found");
        }
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.getAssetStatus = async (req, res) => {
    let connection;
    try {
        // // Input validation
        // const schema = Joi.object({
        //     business_id: Joi.string().required(),
        // });

        // const { error } = schema.validate(req.query);
        // if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        
        connection = await pool.promise().getConnection(); // Get a connection from the pool

        const { business_id } = req.query;
        logger.debug('Extracted business_id from query', { business_id });
        console.log('Extracted business_id:', business_id);
        // Query to fetch asset statuses
        const query = 'SELECT asset_status_value FROM asset_status;';

        const [rows] = await connection.query(query);

        if (rows.length > 0) {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got all asset statuses",
                param: {
                    data: rows,
                },
            });
            logger.info(`Fetched ${rows.length} asset statuses successfully`);
            console.log(`Fetched ${rows.length} asset statuses successfully`);
        } else {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "No asset statuses found for this business id",
                param: "No Data",
            });
            logger.info("No asset statuses found for the given business ID");
            console.log("No asset statuses found for the given business ID");
        }
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        logger.info('Releasing database connection back to pool');
        console.log('Releasing database connection back to pool');
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.getPaymentStatus = async (req, res) => {
    let connection;
    try {

        
        connection = await pool.promise().getConnection(); // Get a connection from the pool

        const { business_id } = req.query;
        logger.debug('Extracted business_id from query', { business_id });
        console.log('Extracted business_id:', business_id);
        // Query to fetch asset statuses
        const query = 'SELECT id,payment_status FROM job_payment_status;';

        const [rows] = await connection.query(query);

        if (rows.length > 0) {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got all payment statuses",
                param: {
                    data: rows,
                },
            });
            logger.info(`Fetched ${rows.length} payment statuses successfully`);
            console.log(`Fetched ${rows.length} payment statuses successfully`);
        } else {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "No payment statuses found for this business id",
                param: "No Data",
            });
            logger.info("No payment statuses found for the given business ID");
            console.log("No payment statuses found for the given business ID");
        }
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        logger.info('Releasing database connection back to pool');
        console.log('Releasing database connection back to pool');
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//exporting xl
exports.exportXl = async (req, res) => {
    let connection;
    try {
        const clientIp = req.socket.remoteAddress;
        const { fromDate, endDate, customerName, caseId, business_id, serialNumber,jobStatus,assetStatus,phoneNumber,engineerName} = req.query;

        logger.info(`Request received from host ${clientIp} for Excel export with parameters:`, req.query);
        console.log(`Request received from host ${clientIp} for Excel export with parameters:`, req.query);
        // Primary validation
        if (!business_id) {
            logger.error("Validation failed business_id is missing");
            console.error("Validation failed business_id is missing");
            throw new Error("business_id is required");
        }

        const isFilterEmpty = !fromDate && !endDate && !customerName && !caseId && !serialNumber && !jobStatus && !assetStatus && !phoneNumber && !engineerName;

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection(); // Use promise-based pool
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");
   
        let query = "";
        let queryParams = [];

        if (isFilterEmpty) {
            query = `
                SELECT 
                    case_registry.customer_name,
                    case_registry.case_id,
                    case_registry.itam_name,
                    case_registry.brand,
                    case_registry.phoe_number,
                    case_registry.model,
                    case_registry.seial_number,
                    case_registry.total_bill,
                    case_registry.advance,
                    case_registry.balance,
                    case_registry.date,
                    work_flow_management.assigne,
                    work_flow_management.status,
                    work_flow_management.case_status 
                FROM case_registry 
                INNER JOIN work_flow_management 
                    ON case_registry.case_id = work_flow_management.case_id 
                WHERE case_registry.business_id = ? AND work_flow_management.business_id = ?`;

            queryParams = [business_id, business_id];
        } else {
            const filterConditions = [];
            logger.info('Initializing filter conditions');
            console.log('Initializing filter conditions');
            if (fromDate) {
                logger.info('Applying fromDate filter', { fromDate });
                console.log(`Adding fromDate: ${fromDate}`);
                filterConditions.push("DATE(case_registry.date) >= ?");
                queryParams.push(fromDate);
            }
            if (endDate) {
                logger.info('Applying endDate filter', { endDate });
                console.log(`Adding endDate: ${endDate}`);
                filterConditions.push("DATE(case_registry.date) <= ?");
                queryParams.push(endDate);
            }
            if (customerName) {
                filterConditions.push("case_registry.customer_name LIKE CONCAT('%', ?, '%')");
                queryParams.push(customerName);
            }
            if (caseId) {
                logger.info('Applying exact caseId filter', { caseId });
                console.log(`Adding exact caseId match: ${caseId}`);
                filterConditions.push("case_registry.case_id = ?");
                queryParams.push(caseId);
            }
            if (serialNumber) {
                filterConditions.push("case_registry.seial_number LIKE CONCAT('%', ?, '%')");
                queryParams.push(serialNumber);
            }
            if (jobStatus) {
                filterConditions.push("work_flow_management.status = ?");
                queryParams.push(jobStatus);
            }
            if (assetStatus) {
                filterConditions.push("work_flow_management.case_status = ?");
                queryParams.push(assetStatus);
            }
            if (phoneNumber) {
                filterConditions.push("case_registry.phoe_number LIKE CONCAT('%', ?, '%')");
                queryParams.push(phoneNumber);
            }
            if (engineerName) {
                filterConditions.push("work_flow_management.assigne LIKE CONCAT('%', ?, '%')");
                queryParams.push(engineerName);
            }

            query = `
                SELECT 
                    case_registry.customer_name,
                    case_registry.case_id,
                    case_registry.itam_name,
                    case_registry.brand,
                    case_registry.phoe_number,
                    case_registry.model,
                    case_registry.seial_number,
                    case_registry.total_bill,
                    case_registry.advance,
                    case_registry.balance,
                    case_registry.date,
                    work_flow_management.assigne,
                    work_flow_management.status,
                    work_flow_management.case_status 
                FROM case_registry 
                INNER JOIN work_flow_management 
                    ON case_registry.case_id = work_flow_management.case_id 
                WHERE ${filterConditions.join(" AND ")} AND case_registry.business_id = ? AND work_flow_management.business_id = ?`;

            queryParams.push(business_id, business_id);
        }

        logger.info(`Executing query: ${query}`);
        console.log(`Executing query: ${query}`);
        logger.info(`Query parameters: ${queryParams}`);
        console.log(`Query parameters: ${queryParams}`);

        const [rows] = await connection.query(query, queryParams);

        if (rows.length === 0) {
            logger.info("No data available for export request.");
             console.log("No data available for export request.");
            return res.status(200).json({
                statusDesc: "Failure",
                statusCode: { code: "F0018" },
                message: "Sorry! You don't have any data to export",
            });
        }

        // Create and populate Excel workbook
        const workbook = new ExcelJS.Workbook();
        logger.info('ExcelJS workbook initialized for export.');
        console.log('ExcelJS workbook initialized for export.');
        const worksheet = workbook.addWorksheet('Case Registry');
        logger.info('Worksheet "Case Registry" added to Excel workbook.');
        console.log('Worksheet "Case Registry" added to Excel workbook.');

        worksheet.columns = [
            { header: 'Customer Name', key: 'customer_name' },
            { header: 'Case ID', key: 'case_id' },
            { header: 'Product', key: 'itam_name' },
            { header: 'Manufacturer', key: 'brand' },
            { header: 'Model', key: 'model' },
            { header: 'Serial Number', key: 'seial_number' },
            { header: 'Phone Number', key: 'phoe_number' },
            { header: 'Total Amount', key: 'total_bill' },
            { header: 'Amount Paid', key: 'advance' },
            { header: 'Outstanding Balance', key: 'balance' },
            { header: 'Service Date', key: 'date' },
            { header: 'Assignee', key: 'assigne' },
            { header: 'Job Status', key: 'status' },
            { header: 'Asset Status', key: 'case_status' },
        ];

        worksheet.addRows(rows);

        // Set response headers for Excel file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="case_registry.xlsx"');

        await workbook.xlsx.write(res);

        logger.info('Excel file generated and sent successfully');
        console.log('Excel file generated and sent successfully');
    } catch (err) {
        logger.error(`Error processing Excel export: ${err.message}`);
        console.error(`Error processing Excel export: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};

//dashbaorf edit
exports.dashBoardEdit = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { case_id, business_id } = body;

        logger.info(`Request reached from host ${clientIp} for DASH BOARD EDIT and request packet:`);
        console.log(`Request reached from host ${clientIp} for DASH BOARD EDIT and request packet:`);
        logger.info(body);
        console.log(body);

        // Input validation
        const schema = Joi.object({
            case_id: Joi.string().required(),
            business_id: Joi.string().required(),
            delivery_date: Joi.string().allow("", null),
        });

        const { error } = schema.validate(body);
        if (error) {
            logger.error(`Validation error: ${error.details[0].message}`);
            console.error(`Validation error: ${error.details[0].message}`);
            return res.status(400).json({
                statusDesc: 'Failure',
                statusCode: { code: 'F001' },
                message: error.details[0].message,
            });
        }

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection(); // Get a connection from the pool
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        // let deliveryDate = body.delivery_date;
        // if (!deliveryDate || deliveryDate.trim() === "") {
        //      deliveryDate = null;
        // }

        // // if delivery_date existts updating
        // logger.info(`Updating delivery_date for case_id ${case_id}`);
        // await connection.query(
        //     `UPDATE case_registry
        //      SET delivery_date = ?
        //      WHERE case_id = ? AND business_id = ?`,
        //     [deliveryDate, case_id, business_id]
        // );

        // Query to fetch case registration data
        const query = `
            SELECT
                cr.customer_name, cr.party_id, cr.phoe_number, cr.customer_phone_alter, cr.email, cr.billingAdress,cr.deviceLock, cr.case_id, cr.reference_case_id, cr.itam_name,
                cr.brand, cr.model, cr.seial_number, cr.issue, cr.support_equpments, cr.work_order_number,cr.total_bill, cr.advance,
                cr.balance, cr.date, cr.case_completion_date, cr.payment_mode, cr.payment_date, cr.delivery_date, cr.auto_bill_flag, cr.bill_status, cr.additional_tag_name, cr.isWorkOrder, cr.work_order_number, cr.work_order_id, wfm.assigne,
                wfm.status, wfm.case_status, wfm.comments, wfm.comment_image
            FROM case_registry AS cr
            INNER JOIN work_flow_management AS wfm ON cr.case_id = wfm.case_id
            WHERE cr.business_id = ? AND wfm.business_id = ? AND cr.case_id = ? AND wfm.case_id = ?
        `;

        logger.info('Fetching detailed case record with parameters', {business_id,case_id});
        console.log('Fetching detailed case record with parameters', {business_id,case_id});
        const [rows] = await connection.query(query, [business_id, business_id, case_id, case_id]);

        //core cache flag
        logger.info('Resetting core cache flag for business', { business_id });
        console.log('Resetting core cache flag for business', { business_id });
        await connection.query(
            `UPDATE core_job_sheet_summary_details SET cache_flag = ? WHERE business_id = ?`,
            [0,business_id]
        );

        if (rows.length > 0) {
            rows[0].delivery_date = rows[0].delivery_date
                ? new Date(rows[0].delivery_date).toLocaleDateString('en-CA')
                : "";
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got case registrations',
                param: {
                    case_data: rows[0], // Return the first result as case data
                },
            });
            logger.info('Data retrieved successfully');
            console.log('Data retrieved successfully');
        } else {
            logger.error('No case found for the provided case_id and business_id');
            console.error('No case found for the provided case_id and business_id');
            res.status(404).json({
                statusDesc: 'Failure',
                statusCode: { code: 'F002' },
                message: 'No case found for the provided case_id and business_id.',
            });
        }
    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//dashbaorf edit
exports.dashBoardEditV2 = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { case_id, business_id } = body;

        logger.info(`Request reached from host ${clientIp} for DASH BOARD EDIT and request packet:`);
        console.log(`Request reached from host ${clientIp} for DASH BOARD EDIT and request packet:`);
        logger.info(body);
        console.log(body);

        // Input validation
        const schema = Joi.object({
            case_id: Joi.string().required(),
            business_id: Joi.string().required(),
            delivery_date: Joi.string().allow("", null),
        });

        const { error } = schema.validate(body);
        if (error) {
            logger.error(`Validation error: ${error.details[0].message}`);
            console.error(`Validation error: ${error.details[0].message}`);
            return res.status(400).json({
                statusDesc: 'Failure',
                statusCode: { code: 'F001' },
                message: error.details[0].message,
            });
        }

        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection(); // Get a connection from the pool
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        // let deliveryDate = body.delivery_date;
        // if (!deliveryDate || deliveryDate.trim() === "") {
        //      deliveryDate = null; 
        // }

        // // if delivery_date existts updating
        // logger.info(`Updating delivery_date for case_id ${case_id}`);
        // await connection.query(
        //     `UPDATE case_registry 
        //      SET delivery_date = ? 
        //      WHERE case_id = ? AND business_id = ?`,
        //     [deliveryDate, case_id, business_id]
        // );

        // Query to fetch case registration data
        const query = `
            SELECT 
                cr.customer_name, cr.party_id, cr.phoe_number, cr.customer_phone_alter, cr.email, cr.billingAdress,cr.deviceLock, cr.case_id, cr.reference_case_id, cr.itam_name, 
                cr.brand, cr.model, cr.seial_number, cr.issue, cr.support_equpments, cr.work_order_number,cr.total_bill, cr.advance, 
                cr.balance, cr.date, cr.case_completion_date, cr.payment_mode, cr.payment_date, cr.delivery_date, cr.auto_bill_flag, cr.bill_status, cr.additional_tag_name, cr.isWorkOrder, cr.work_order_number, cr.work_order_id, wfm.assigne, 
                wfm.status, wfm.case_status, wfm.comments, wfm.comment_image,cr.received_serial_number,
                COALESCE(ctmd.transfer_req_id, '') AS transfer_req_id,
                COALESCE(ctmd.status, 0) AS transfer_status
            FROM case_registry AS cr
            INNER JOIN work_flow_management AS wfm ON cr.case_id = wfm.case_id
            LEFT JOIN core_transfer_master_details AS ctmd
            ON ctmd.case_id = cr.case_id AND ctmd.business_id = cr.business_id
            WHERE cr.business_id = ? AND wfm.business_id = ? AND cr.case_id = ? AND wfm.case_id = ?
            ORDER BY ctmd.transfer_req_id DESC LIMIT 1
        `;

        logger.info('Fetching detailed case record with parameters', {business_id,case_id});
        console.log('Fetching detailed case record with parameters', {business_id,case_id});
        const [rows] = await connection.query(query, [business_id, business_id, case_id, case_id]);
        
        //core cache flag
        logger.info('Resetting core cache flag for business', { business_id });
        console.log('Resetting core cache flag for business', { business_id });
        await connection.query(
            `UPDATE core_job_sheet_summary_details SET cache_flag = ? WHERE business_id = ?`,
            [0,business_id]
        );

        if (rows.length > 0) {
            rows[0].delivery_date = rows[0].delivery_date
                ? new Date(rows[0].delivery_date).toLocaleDateString('en-CA')
                : "";
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got case registrations',
                param: {
                    case_data: rows[0], // Return the first result as case data
                },
            });
            logger.info('Data retrieved successfully');
            console.log('Data retrieved successfully');
        } else {
            logger.error('No case found for the provided case_id and business_id');
            console.error('No case found for the provided case_id and business_id');
            res.status(404).json({
                statusDesc: 'Failure',
                statusCode: { code: 'F002' },
                message: 'No case found for the provided case_id and business_id.',
            });
        }
    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.dashBoardSaveChanges = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        const {
            customer_name, party_id, phoe_number, case_id, reference_case_id, business_id, alternate_number,billingAdress,itam,brand,model,serialNumber, email,
            issue, support_equpments,deviceLock, total_bill, advance, balance, payment_mode, assigne,
            status, case_status, comments, delivery_date, action_owner, auto_bill_flag, state_code, state_name, additional_tag_name
        } = body;

        logger.info(`Request reached from host ${clientIp} for DASH BOARD SAVE CHANGES and request packet:`);
        console.log(`Request reached from host ${clientIp} for DASH BOARD SAVE CHANGES and request packet:`);
        logger.info(body);
        console.log(body);
        // Validate inputs
        const schema = Joi.object({
            customer_name: Joi.string().required(),
            party_id: Joi.number().required(),
            phoe_number: Joi.string().pattern(/^\d{10}$/).required(), // Added validation for phone number
            alternate_number: Joi.string().allow(''),
            billingAdress:Joi.string().allow(''),
            itam: Joi.string().optional(),
            brand:Joi.string().allow(''),
            model:Joi.string().allow(''),
            serialNumber:Joi.string().allow(''),
            email: Joi.string().email().allow(''),
            issue: Joi.string().allow(''),
            support_equpments:Joi.string().allow(''),
            deviceLock:Joi.string().allow(''),
            total_bill:Joi.string().allow(''),
            assigne: Joi.string().required(),
            payment_mode: Joi.string().required(),
            advance:Joi.string().allow(''),
            balance:Joi.string().allow(''),
            status:Joi.string().required(),
            case_id: Joi.string().required(),
            reference_case_id: Joi.string().allow("", null),
            case_status:Joi.string().required(),
            business_id: Joi.string().required(),
            comments:Joi.string().allow(''),
            delivery_date: Joi.alternatives().try(Joi.string(), Joi.allow(null)).optional(),
            action_owner: Joi.string().required(),
            auto_bill_flag: Joi.number().valid(0, 1).optional(),
            state_code: Joi.string().trim().max(10).optional(),
            state_name: Joi.string().trim().optional(),
            additional_tag_name: Joi.string().trim().allow("").optional(),
        });

        const { error } = schema.validate(body);
        if (error) {
            logger.error(`Validation error: ${error.details[0].message}`);
            console.error(`Validation error: ${error.details[0].message}`);
            return res.status(400).json({
                statusDesc: 'Failure',
                statusCode: { code: 'F001' },
                message: error.details[0].message,
            });
        }

        logger.info('Generating current timestamp');
        console.log('Creating current timestamp');
        const currentTimestamp = moment();
        logger.info('Formatting timestamp for display');
        console.log('Formatting for display');
        const formattedTimestamp = currentTimestamp.format('YYYY-MM-DD HH:mm:ss');
        logger.info('Setting default closing date');
        console.log('Initializing closing date');
        let closingDate = "00/00/000";
        let paymentDate = payment_mode === "CREDIT" ? "00/00/000" : formattedTimestamp;
        let isNotification = false
        let isRedy = false
        let isDeliverd =  false
        let nmsConfirmation =  false
        // Set default values for total_bill, advance, balance if not provided
        // total_bill = total_bill
        // advance = advance
        // balance = balance

        // Case status date update
        if (case_status === "DELIVERED") {

            closingDate = formattedTimestamp;
            isNotification = true
            isDeliverd = true
        }
        if(status ==="READY"){

            isNotification = true
            isRedy = true

        }

        // Start database transactions
        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection(); // Get a connection from the pool
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        //check assignee
        const [existingAssigne] = await connection.query(
            'SELECT * FROM `master-users` WHERE userName = ? AND business_id = ?',
            [assigne,business_id]
        )
        logger.info(`assigne test ${existingAssigne}`);
        console.log(`assigne test ${existingAssigne}`)

        if(existingAssigne.length === 0){
            logger.info('Assignee not found for the given business', { business_id, assigne });
            console.log('Assignee not found for the given business', { business_id, assigne });
            throw new Error('Assigned person does not exist in your company')
        }
        //check due amount is updated or not
        const [caseDueAmount] = await connection.query(
            'SELECT advance FROM `case_registry` WHERE case_id = ? AND business_id = ?',
            [case_id,business_id]
        )
        logger.info(`assigne test ${existingAssigne}`);
        console.log(`assigne test ${existingAssigne}`)

        if(caseDueAmount[0].advance !== advance){

            //due amount is colected for this case id
            let collectedAmount = (advance - caseDueAmount[0].advance)

            //calling journal API for posting
            //calling event Api
            logger.info("Calling API for due amount journal");
            console.log("Calling API for due amount journal");
            const payload = {
                new_customers: 0,
                old_customers: 0,
                due_collected: collectedAmount,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });
        }
        // Update party details
        await connection.query(
            'UPDATE `party_details` SET customer_name = ?,phone_number = ?, alternate_phone_number = ?, email = ?, billing_adress = ? WHERE id = ? AND business_id = ?',
            [customer_name,phoe_number, alternate_number, email, billingAdress, party_id, business_id]
        );
        logger.info("Updated party details");
        console.log("Updated party details");


        // Update case registry details
        await connection.query(
            'UPDATE `case_registry` SET customer_name = ?, phoe_number = ?, email = ?,billingAdress = ?,itam_name =?, brand = ?, model = ?, seial_number = ?, issue = ?, support_equpments = ?,deviceLock = ?, assigne = ?, total_bill = ?, advance = ?, balance = ?, customer_phone_alter = ?, case_completion_date = ?, payment_mode = ?, payment_date = ?, delivery_date = ?, action_owner = ?, auto_bill_flag = ?, additional_tag_name = ?,reference_case_id = ? WHERE case_id = ? AND business_id = ?',
            [customer_name,phoe_number, email,billingAdress, itam,brand,model,serialNumber,issue, support_equpments,deviceLock, assigne, total_bill, advance, balance, alternate_number, closingDate, payment_mode, paymentDate, delivery_date, action_owner, auto_bill_flag, additional_tag_name || "Additional Charges", reference_case_id , case_id, business_id]
        );
        logger.info("Updated case registry details");
        console.log("Updated case registry details");

        // Update workflow management
        await connection.query(
            'UPDATE `work_flow_management` SET assigne = ?, status = ?, case_status = ?, comments = ? WHERE case_id = ? AND business_id = ?',
            [assigne, status, case_status, comments, case_id, business_id]
        );
        logger.info("Updated work flow management");
        console.log("Updated work flow management");
        // Call internal API (Event creation)
        const payload = {
            case_id: case_id,
            assigne: assigne,
            status: status,
            asset_status:case_status,
            total_amount:total_bill,
            recived_amount:advance,
            flag: 1,
            businessId: business_id,
            action_owner: action_owner
        };
        logger.info(`event paylod created and ${payload}`)
        try {
            logger.info(`Reporting API call : ${BASE_URL}/rptCreateEvent`, payload)
            const response = await axios.post(`${BASE_URL}/rptCreateEvent`, payload);
            logger.info('API sent successfully:', response.data);
            console.log('API sent successfully:', response.data);
        } catch (error) {
            logger.error('Error sending API:', error);
            console.error('Error sending API:', error);
        }

        //sendoing meta notification
        if(isNotification){
            //sending meta notification
            if(sandBox == "TRUE"){

                //Testing mode
            }else{
                //checking meta flag
                const [metaFlag] = await connection.query(
                    'SELECT  meta_flag,compnay_name,message_footer_flag,relam_id from relam_master WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE business_id = ? LIMIT 1)',
                    [business_id]
                );

                const [notificationFlag] = await connection.query(
                    'SELECT notification_flag,itam_name,delivery_notification_flag FROM case_registry WHERE case_id = ? AND business_id = ?',
                    [case_id,business_id]
                );

                if (metaFlag[0].meta_flag === 1 && ( notificationFlag[0].notification_flag === 0 || notificationFlag[0].delivery_notification_flag === 0)) {
                    logger.error(`User enabled the meta notification so sending the notification`)

                   let contactUsNumbers = ""
                    //fetching shop details

                    //checking buiness number is there or not
                    const [business_number] = await connection.query(
                        'SELECT busines_numbers FROM `relam_master` WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE slave_id = 0 AND business_id = ?)',
                        [business_id]
                    );

                    if (!business_number.length || !business_number[0].busines_numbers) {
                        logger.info("No business number is found so fetching user number")

                        const [contactNumber] = await connection.query(
                            'SELECT phone_number FROM `master-users` WHERE slave_id = 0 AND business_id = ?',
                            [business_id]
                        );

                        contactUsNumbers = contactNumber[0].phone_number
                        logger.info(`contact number set as ${contactUsNumbers}`)

                    }else{
                        contactUsNumbers = business_number[0].busines_numbers
                        logger.info(`business number is found ${contactUsNumbers}`)
                    }

                    //formating param body and templates
                    let template = ""
                    let params = []

                    if(notificationFlag[0].notification_flag === 0 && isRedy){
                        //job completed
                        template = "1015"
                        nmsConfirmation = true
                        params = [
                           {
                                type: "text",
                                text: customer_name
                            },
                            {
                                type: "text",
                                text: case_id
                            },
                            {
                                type: "text",
                                text: notificationFlag[0].itam_name
                            },
                            {
                                type: "text",
                                text: total_bill
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            },
                            {
                                type: "text",
                                text: contactUsNumbers
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            }
                        ]

                        //UPDATING META FLAG
                        logger.info(`Cecking footer flag as ${metaFlag[0].message_footer_flag}`);
                        if(metaFlag[0].message_footer_flag === 1){
                            //sending service record
                            //calling event Api
                            logger.info("Calling intel Api.");
                            console.log("Calling intel Api.");
                            const payload = {
                                customer_name: customer_name,
                                contact_number: phoe_number,
                                document_id: case_id,
                                realam_id:metaFlag[0].relam_id,
                                business_id: business_id
                            };
                            logger.info("payload created");
                            console.log("Payload created");

                            //calling mail sender
                            axios.post(`${INTEL_URL}/intel-svc/api/v1/sendServiceRecordAttachment`, payload)

                            .then(response => {
                                logger.info(`Mail sender API successful for case_id: ${payload.case_id}`);
                                console.log('API sent successfully:', response.data);
                            })

                            .catch(error => {
                                logger.error(`Mail sender API failed for case_id: ${payload.case_id} - ${error.message}`);
                                console.error('Error sending API:', error);
                            });
                        }

                        //UPDATING NOTIFICATION FLAG IN CASE REGISTRY
                        const [updateFlag] = await connection.query(
                            'UPDATE case_registry SET notification_flag = 1 WHERE case_id = ? AND business_id = ?',
                            [case_id,business_id]
                        );
                    }else if(notificationFlag[0].delivery_notification_flag === 0 && isDeliverd){
                        //job deliverd
                        template = "1026"
                        nmsConfirmation = true
                        params = [
                            {
                                type: "text",
                                text: customer_name
                            },
                            {
                                type: "text",
                                text: case_id
                            },
                            {
                                type: "text",
                                text: notificationFlag[0].itam_name
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            },
                            {
                                type: "text",
                                text: contactUsNumbers
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            }
                        ]
                        //UPDATINF DELIVERY FLAG
                        const [updateFlag] = await connection.query(
                            'UPDATE case_registry SET delivery_notification_flag = 1 WHERE case_id = ? AND business_id = ?',
                            [case_id,business_id]
                        );
                    }
                    //calling nms API
                    // Send meta notification notification
                    const re_id = `REQ${Date.now()}`;
                    const payloadMeta = {
                        re_id: re_id,
                        destination_phone_number: `91${phoe_number}`,
                        customer_name:customer_name,
                        template_id: template,
                        message_type: "text",
                        media_url: "/sample/filepath",
                        params:params,
                        isBypass : "0",
                        business_id:business_id
                        };

                        if(nmsConfirmation){
                            try {
                                // await axios.post(`${NMS_URL}/nms/api/v1/sendMetaNotifications`, payloadMeta);
                                await axios.post(`${NMS_URL}/nms/api/v2/sendMetaNotifications`, payloadMeta);

                                logger.info(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);
                                console.log(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);

                            } catch (metaError) {
                                logger.error("Error sending notification:", metaError);
                                console.error("Error sending notification:", metaError);
                            }
                        } else{
                            logger.info("No need to call nms no notification available sending to cstomer")
                        }
                }
            }

        }
        // Send success response
        res.send({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'Saved the changes',
        });
        logger.info("Saved the changes successfully");
        console.log("Saved the changes successfully");

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};



exports.dashBoardSaveChangesV2 = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        const { 
            customer_name, party_id, phoe_number, case_id, reference_case_id, business_id, alternate_number,billingAdress,itam,brand,model,serialNumber, email, 
            issue, support_equpments,deviceLock, total_bill, advance, balance, payment_mode, assigne, 
            status, case_status, comments, delivery_date, action_owner, auto_bill_flag, state_code, state_name, additional_tag_name ,payment_status
        } = body;

        logger.info(`Request reached from host ${clientIp} for DASH BOARD SAVE CHANGES and request packet:`);
        console.log(`Request reached from host ${clientIp} for DASH BOARD SAVE CHANGES and request packet:`);
        logger.info(body);
        console.log(body);
        // Validate inputs
        const schema = Joi.object({
            customer_name: Joi.string().required(),
            party_id: Joi.number().required(),
            phoe_number: Joi.string().pattern(/^\d{10}$/).required(), // Added validation for phone number
            alternate_number: Joi.string().allow(''),
            billingAdress:Joi.string().allow(''),
            itam: Joi.string().optional(),
            brand:Joi.string().allow(''),
            model:Joi.string().allow(''),
            serialNumber:Joi.string().allow(''),
            email: Joi.string().email().allow(''),
            issue: Joi.string().allow(''),
            support_equpments:Joi.string().allow(''),
            deviceLock:Joi.string().allow(''),
            total_bill:Joi.string().allow(''),
            assigne: Joi.string().required(),
            payment_mode: Joi.string().required(),
            advance:Joi.string().allow(''),
            balance:Joi.string().allow(''),
            status:Joi.string().required(),
            case_id: Joi.string().required(),
            reference_case_id: Joi.string().allow("", null),
            case_status:Joi.string().required(),
            business_id: Joi.string().required(),
            comments:Joi.string().allow(''),
            delivery_date: Joi.alternatives().try(Joi.string(), Joi.allow(null)).optional(),
            action_owner: Joi.string().required(),
            auto_bill_flag: Joi.number().valid(0, 1).optional(),
            state_code: Joi.string().trim().max(10).optional(),
            state_name: Joi.string().trim().optional(),
            additional_tag_name: Joi.string().trim().allow("").optional(),
            payment_status: Joi.string().required(),
        });

        const { error } = schema.validate(body);
        if (error) {
            logger.error(`Validation error: ${error.details[0].message}`);
            console.error(`Validation error: ${error.details[0].message}`);
            return res.status(400).json({
                statusDesc: 'Failure',
                statusCode: { code: 'F001' },
                message: error.details[0].message,
            });
        }

        logger.info('Generating current timestamp');
        console.log('Creating current timestamp');
        const currentTimestamp = moment();
        logger.info('Formatting timestamp for display');
        console.log('Formatting for display');
        const formattedTimestamp = currentTimestamp.format('YYYY-MM-DD HH:mm:ss');
        logger.info('Setting default closing date');
        console.log('Initializing closing date');
        let closingDate = "00/00/000";
        let paymentDate = payment_mode === "CREDIT" ? "00/00/000" : formattedTimestamp;
        let isNotification = false
        let isRedy = false
        let isDeliverd =  false
        let nmsConfirmation =  false

        // Set default values for total_bill, advance, balance if not provided
        // total_bill = total_bill 
        // advance = advance 
        // balance = balance 

        // Case status date update
        if (case_status === "DELIVERED") {

            closingDate = formattedTimestamp;
            isNotification = true
            isDeliverd = true
        }
        if(status ==="READY"){

            isNotification = true
            isRedy = true

        }

        // Start database transactions
        logger.info("Requesting database connection from pool.");
        console.log("Requesting database connection from pool.");
        connection = await pool.promise().getConnection(); // Get a connection from the pool
        logger.info("Database connection established successfully.");
        console.log("Database connection established successfully.");

        //check assignee
        const [existingAssigne] = await connection.query(
            'SELECT * FROM `master-users` WHERE userName = ? AND business_id = ?',
            [assigne,business_id]
        )
        logger.info(`assigne test ${existingAssigne}`);
        console.log(`assigne test ${existingAssigne}`)

        if(existingAssigne.length === 0){
            logger.info('Assignee not found for the given business', { business_id, assigne });
            console.log('Assignee not found for the given business', { business_id, assigne });
            throw new Error('Assigned person does not exist in your company')
        }

        //set payment status
        const [payment_rows] = await connection.query(`SELECT id from job_payment_status WHERE payment_status= ?`, [body.payment_status]);
        let payment_status_id = payment_rows[0].id;

        //check due amount is updated or not
        const [caseDueAmount] = await connection.query(
            'SELECT advance,total_bill FROM `case_registry` WHERE case_id = ? AND business_id = ?',
            [case_id,business_id]
        )
        logger.info(`current amount ${caseDueAmount[0].advance}`);
        console.log(`assigne test ${existingAssigne}`)

        if(caseDueAmount[0].advance != advance){

            //due amount is colected for this case id
            let collectedAmount = (advance - caseDueAmount[0].advance)
            logger.info(`current amount 2 ${caseDueAmount[0].advance}`);

            //calling journal API for posting
            //calling event Api
            logger.info("Calling API for due amount journal");
            console.log("Calling API for due amount journal");
            const payload = {
                new_customers: 0,
                old_customers: 0,
                due_collected: collectedAmount,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });

            //payment Ledger API call
            console.log("Calling payment ledger Api.");
            const payload_for_payment_ledger = {
                cutsomer_id: party_id,
                document_number: case_id,
                document_type: 6,
                grand_total:0,
                received_amount:collectedAmount,
                transaction_date:formattedTimestamp,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${POS_URL}/api/v1/postPaymentLedgers`, payload_for_payment_ledger)
            .then(response => {
                logger.info(` payment ledger Api successful for case_id: ${payload_for_payment_ledger.case_id}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(` payment ledger Api failed for case_id: ${payload.case_id} - ${error.message}`);
                console.error('Error sending API:', error);
            });
        }
        //checking the total amount is changed
        if(caseDueAmount[0].total_bill !== total_bill){
            //payment Ledger API call
            let newTotal = (total_bill - caseDueAmount[0].total_bill)
            console.log("Calling payment ledger Api.");
            const payload_for_payment_ledger = {
                cutsomer_id: party_id,
                document_number: case_id,
                document_type: 6,
                grand_total:newTotal,
                received_amount:0,
                transaction_date:formattedTimestamp,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${POS_URL}/api/v1/postPaymentLedgers`, payload_for_payment_ledger)
            .then(response => {
                logger.info(` payment ledger Api successful for case_id: ${payload_for_payment_ledger.case_id}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(` payment ledger Api failed for case_id: ${payload.case_id} - ${error.message}`);
                console.error('Error sending API:', error);
            });
        }
        // Update party details
        await connection.query(
            'UPDATE `party_details` SET customer_name = ?,phone_number = ?, alternate_phone_number = ?, email = ?, billing_adress = ? WHERE id = ? AND business_id = ?',
            [customer_name,phoe_number, alternate_number, email, billingAdress, party_id, business_id]
        );
        logger.info("Updated party details");
        console.log("Updated party details");
       

        // Update case registry details
        await connection.query(
            'UPDATE `case_registry` SET customer_name = ?, phoe_number = ?, email = ?,billingAdress = ?,itam_name =?, brand = ?, model = ?, seial_number = ?, issue = ?, support_equpments = ?,deviceLock = ?, assigne = ?, total_bill = ?, advance = ?, balance = ?, customer_phone_alter = ?, case_completion_date = ?, payment_mode = ?, payment_date = ?, delivery_date = ?, action_owner = ?, auto_bill_flag = ?, additional_tag_name = ?,reference_case_id = ?, payment_status=? WHERE case_id = ? AND business_id = ?',
            [customer_name,phoe_number, email,billingAdress, itam,brand,model,serialNumber,issue, support_equpments,deviceLock, assigne, total_bill, advance, balance, alternate_number, closingDate, payment_mode, paymentDate, delivery_date, action_owner, auto_bill_flag, additional_tag_name || "Additional Charges", reference_case_id ,payment_status_id, case_id, business_id]
        );
        logger.info("Updated case registry details");
        console.log("Updated case registry details");

        // Update workflow management
        await connection.query(
            'UPDATE `work_flow_management` SET assigne = ?, status = ?, case_status = ?, comments = ? WHERE case_id = ? AND business_id = ?',
            [assigne, status, case_status, comments, case_id, business_id]
        );
        logger.info("Updated work flow management");
        console.log("Updated work flow management");
        // Call internal API (Event creation)
        const payload = {
            case_id: case_id,
            assigne: assigne,
            status: status,
            asset_status:case_status,
            total_amount:total_bill,
            recived_amount:advance,
            flag: 1,
            businessId: business_id,
            action_owner: action_owner
        };
        logger.info(`event paylod created and ${payload}`)
        try {
            logger.info(`Reporting API call : ${BASE_URL}/rptCreateEvent`, payload)
            const response = await axios.post(`${BASE_URL}/rptCreateEvent`, payload);
            logger.info('API sent successfully:', response.data);
            console.log('API sent successfully:', response.data);
        } catch (error) {
            logger.error('Error sending API:', error);
            console.error('Error sending API:', error);
        }

        //sendoing meta notification
        if(isNotification){
            //sending meta notification
            if(sandBox == "TRUE"){

                //Testing mode
            }else{
                //checking meta flag
                const [metaFlag] = await connection.query(
                    'SELECT  meta_flag,compnay_name,message_footer_flag,relam_id from relam_master WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE business_id = ? LIMIT 1)',
                    [business_id]
                );

                const [notificationFlag] = await connection.query(
                    'SELECT notification_flag,itam_name,delivery_notification_flag FROM case_registry WHERE case_id = ? AND business_id = ?',
                    [case_id,business_id]
                );
                
                if (metaFlag[0].meta_flag === 1 && ( notificationFlag[0].notification_flag === 0 || notificationFlag[0].delivery_notification_flag === 0)) {
                    logger.error(`User enabled the meta notification so sending the notification`)

                   let contactUsNumbers = ""
                    //fetching shop details

                    //checking buiness number is there or not 
                    const [business_number] = await connection.query(
                        'SELECT busines_numbers FROM `relam_master` WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE slave_id = 0 AND business_id = ?)',
                        [business_id]
                    );
                    
                    if (!business_number.length || !business_number[0].busines_numbers) {
                        logger.info("No business number is found so fetching user number")

                        const [contactNumber] = await connection.query(
                            'SELECT phone_number FROM `master-users` WHERE slave_id = 0 AND business_id = ?',
                            [business_id]
                        );

                        contactUsNumbers = contactNumber[0].phone_number
                        logger.info(`contact number set as ${contactUsNumbers}`)

                    }else{
                        contactUsNumbers = business_number[0].busines_numbers
                        logger.info(`business number is found ${contactUsNumbers}`)
                    }
                    
                    //formating param body and templates
                    let template = ""
                    let params = []

                    if(notificationFlag[0].notification_flag === 0 && isRedy){
                        //job completed
                        template = "1015"
                        nmsConfirmation = true
                        params = [
                            {
                                type: "text",
                                text: customer_name
                            },
                            {
                                type: "text",
                                text: case_id
                            },
                            {
                                type: "text",
                                text: notificationFlag[0].itam_name
                            },
                            {
                                type: "text",
                                text: total_bill
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            },
                            {
                                type: "text",
                                text: contactUsNumbers
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            }
                        ]

                        //UPDATING META FLAG
                        logger.info(`Cecking footer flag as ${metaFlag[0].message_footer_flag}`);
                        if(metaFlag[0].message_footer_flag === 1){
                            //sending service record
                            //calling event Api
                            logger.info("Calling intel Api.");
                            console.log("Calling intel Api.");
                            const payload = {
                                customer_name: customer_name,
                                contact_number: phoe_number,
                                document_id: case_id,
                                realam_id:metaFlag[0].relam_id,
                                business_id: business_id
                            };
                            logger.info("payload created");
                            console.log("Payload created");

                            //calling mail sender
                            axios.post(`${INTEL_URL}/intel-svc/api/v1/sendServiceRecordAttachment`, payload)

                            .then(response => {
                                logger.info(`Mail sender API successful for case_id: ${payload.case_id}`);
                                console.log('API sent successfully:', response.data);
                            })

                            .catch(error => {
                                logger.error(`Mail sender API failed for case_id: ${payload.case_id} - ${error.message}`);
                                console.error('Error sending API:', error);
                            });
                        }

                        //UPDATING NOTIFICATION FLAG IN CASE REGISTRY
                        const [updateFlag] = await connection.query(
                            'UPDATE case_registry SET notification_flag = 1 WHERE case_id = ? AND business_id = ?',
                            [case_id,business_id]
                        );
                    }else if(notificationFlag[0].delivery_notification_flag === 0 && isDeliverd){
                        //job deliverd
                        template = "1026"
                        nmsConfirmation = true
                        params = [
                            {
                                type: "text",
                                text: customer_name
                            },
                            {
                                type: "text",
                                text: case_id
                            },
                            {
                                type: "text",
                                text: notificationFlag[0].itam_name
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            },
                            {
                                type: "text",
                                text: contactUsNumbers
                            },
                            {
                                type: "text",
                                text: metaFlag[0].compnay_name
                            }
                        ]
                        //UPDATINF DELIVERY FLAG
                        const [updateFlag] = await connection.query(
                            'UPDATE case_registry SET delivery_notification_flag = 1 WHERE case_id = ? AND business_id = ?',
                            [case_id,business_id]
                        );
                    }
                    //calling nms API 
                    // Send meta notification notification
                    const re_id = `REQ${Date.now()}`;
                    const payloadMeta = {
                        re_id: re_id,
                        destination_phone_number: `91${phoe_number}`,
                        customer_name:customer_name,
                        template_id: template,
                        message_type: "text",
                        media_url: "/sample/filepath",
                        params:params,
                        isBypass : "0",
                        business_id:business_id
                        };

                        if(nmsConfirmation){
                            try {
                                // await axios.post(`${NMS_URL}/nms/api/v1/sendMetaNotifications`, payloadMeta);
                                await axios.post(`${NMS_URL}/nms/api/v2/sendMetaNotifications`, payloadMeta);

                                logger.info(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);
                                console.log(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);

                            } catch (metaError) {
                                logger.error("Error sending notification:", metaError);
                                console.error("Error sending notification:", metaError);
                            }          
                        } else{
                            logger.info("No need to call nms no notification available sending to cstomer")
                        }         
                }
            }

        }   
        // Send success response
        res.send({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'Saved the changes',
        });
        logger.info("Saved the changes successfully");
        console.log("Saved the changes successfully");

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};


exports.dashBoardCaseDelete = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        const { business_id, case_id } = body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for delete case and request packet:`);
        console.log(`Request reached from host ${clientIp} for delete case and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && case_id) {
            // Start database transactions
            connection = await pool.promise().getConnection(); // Get a connection from the pool

            // Delete from case_registry
            await connection.query(
                'DELETE FROM `case_registry` WHERE case_id = ? AND business_id = ?',
                [case_id, business_id]
            );
            logger.info(`Case id ${case_id} deleted from case registry`);
            console.log(`Case id ${case_id} deleted from case registry`);

            // Delete from work_flow_management
            await connection.query(
                'DELETE FROM `work_flow_management` WHERE case_id = ? AND business_id = ?',
                [case_id, business_id]
            );
            logger.info(`Case id ${case_id} deleted from case work flow`);
            console.log(`Case id ${case_id} deleted from case work flow`);

            // Delete from inventory_product_job_sheet
            await connection.query(
                'DELETE FROM `inventory_product_job_sheet` WHERE case_id = ? AND business_id = ?',
                [case_id, business_id]
            );
            logger.info(`Case id ${case_id} deleted from inventory product job sheet`);
            console.log(`Case id ${case_id} deleted from inventory product job sheet`);

            // Send success response
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Case successfully removed',
            });
            logger.info("Case successfully removed");
            console.log("Case successfully removed");

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.workFlowGetAllWorks = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, page_number } = body;
        const count = PAGE_ROWS;

        // Logging
        logger.info(`Request reached from host ${clientIp} for work-flow-get all works and request packet:`);
        console.log(`Request reached from host ${clientIp} for work-flow-get all works and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && business_id !== "") {
            // Start database transactions
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection(); // Get a connection from the pool
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");

            // Query to get all works
            const [rows] = await connection.query(
                `SELECT assigne, 
                        COUNT(*) AS total_cases_assigned, 
                        SUM(CASE WHEN status = 'INPROGRESS' THEN 1 ELSE 0 END) AS total_new_cases, 
                        SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END) AS total_completed_cases, 
                        SUM(CASE WHEN status = 'RETURN' THEN 1 ELSE 0 END) AS total_inprogress_cases, 
                        SUM(CASE WHEN status = 'REPEATE' THEN 1 ELSE 0 END) AS total_blocked_cases 
                 FROM work_flow_management 
                 WHERE business_id = ? 
                 GROUP BY assigne 
                 ORDER BY date DESC 
                 LIMIT ? OFFSET ?`,
                [business_id, count, (page_number - 1) * count]
            );

            // Send success response
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got all works successfully',
                params: rows,
            });
            logger.info("Got all works successfully");
            console.log("Got all works successfully");

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.workFlowGetAllWorksv2 = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, page_number, employee_name,PAGE_ROWS } = body;
        const count = parseInt(PAGE_ROWS,10);

        // Logging
        logger.info(`Request reached from host ${clientIp} for work-flow-get all works and request packet:`);
        console.log(`Request reached from host ${clientIp} for work-flow-get all works and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && business_id !== "") {
            // Start database transactions
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection(); // Get a connection from the pool
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.")

        if(employee_name)
        {
        const [rows] = await connection.query(
                `SELECT assigne, 
                        COUNT(*) AS total_cases_assigned, 
                        SUM(CASE WHEN wfm.status = 'INPROGRESS' THEN 1 ELSE 0 END) AS total_new_cases, 
                        SUM(CASE WHEN wfm.status = 'READY' THEN 1 ELSE 0 END) AS total_completed_cases, 
                        SUM(CASE WHEN wfm.status = 'RETURN' THEN 1 ELSE 0 END) AS total_inprogress_cases, 
                        SUM(CASE WHEN wfm.status = 'REPEATE' THEN 1 ELSE 0 END) AS total_blocked_cases, 
                        mu.role_index
                 FROM work_flow_management wfm JOIN \`master-users\` mu ON wfm.assigne = mu.userName
                 WHERE wfm.assigne LIKE ? AND wfm.business_id = ? 
                 GROUP BY wfm.assigne 
                 ORDER BY wfm.date DESC 
                 LIMIT ? OFFSET ?`,
                ['%'+employee_name+'%', business_id, count, (page_number - 1) * count]
            );
             rows.forEach(r=>{
             switch (r.role_index) {
                    case 0:
                        r.role_index = 'ADMINISTRATOR';
                        break;
                    case 1:
                        r.role_index = 'ENGINEER';
                        break;
                    case 2:
                        r.role_index = 'FRONT OFFICER';
                        break;
                    case 3:
                        r.role_index = 'SALES HEAD';
                        break;
                    case 4:
                        r.role_index = 'SALES PERSON';
                        break;
                    case 5:
                        r.role_index = 'INVENTORY MASTER';
                        break;
                    default:
                        break;
                }
            })
            // Send success response
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got all works successfully',
                params: rows,
            });
            
        }
        else{
            // Query to get all works
            const [rows] = await connection.query(
                `SELECT assigne, 
                        COUNT(*) AS total_cases_assigned, 
                        SUM(CASE WHEN wfm.status = 'INPROGRESS' THEN 1 ELSE 0 END) AS total_new_cases, 
                        SUM(CASE WHEN wfm.status = 'READY' THEN 1 ELSE 0 END) AS total_completed_cases, 
                        SUM(CASE WHEN wfm.status = 'RETURN' THEN 1 ELSE 0 END) AS total_inprogress_cases, 
                        SUM(CASE WHEN wfm.status = 'REPEATE' THEN 1 ELSE 0 END) AS total_blocked_cases,
                        mu.role_index  
                 FROM work_flow_management wfm JOIN \`master-users\` mu ON wfm.assigne = mu.userName
                 WHERE  wfm.business_id = ? 
                 GROUP BY wfm.assigne 
                 ORDER BY wfm.date DESC 
                 LIMIT ? OFFSET ?`,
                [business_id, count, (page_number - 1) * count]
            );
            rows.forEach(r=>{
            switch (r.role_index) {
                    case 0:
                        r.role_index = 'ADMINISTRATOR';
                        break;
                    case 1:
                        r.role_index = 'ENGINEER';
                        break;
                    case 2:
                        r.role_index = 'FRONT OFFICER';
                        break;
                    case 3:
                        r.role_index = 'SALES HEAD';
                        break;
                    case 4:
                        r.role_index = 'SALES PERSON';
                        break;
                    case 5:
                        r.role_index = 'INVENTORY MASTER';
                        break;
                    default:
                        break;
                }
            })

            // Send success response
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got all works successfully',
                params: rows,
            });
        }
            logger.info("Got all works successfully");
            console.log("Got all works successfully");

        } else { 
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.workFlowGetWorkerHistory = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, workerName, page_number } = body;
        const count = PAGE_ROWS;

        // Logging
        logger.info(`Request reached from host ${clientIp} for work-flow-get worker history and request packet:`);
        console.log(`Request reached from host ${clientIp} for work-flow-get worker history and request packet:`);
        logger.info(body);
        console.log(body);
        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && workerName && business_id !== "" && workerName !== "") {
            // Start database transactions
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection(); // Get a connection from the pool
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get worker history
            const [rows] = await connection.query(
                `SELECT date, case_id, status, assigne 
                 FROM work_flow_management 
                 WHERE business_id = ? AND assigne = ? 
                 ORDER BY date DESC 
                 LIMIT ? OFFSET ?`,
                [business_id, workerName, count, (page_number - 1) * count]
            );

            // Send success response
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got all worker history successfully',
                params: rows,
            });
            logger.info("Got all worker history successfully");
            console.log("Got all worker history successfully");

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.workFlowGetWorkerHistoryv2 = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, workerName, page_number, case_id, fromDate, endDate, filterFlag ,sort_by,sort_order,work_status} = body;
        const PAGE_ROWS = Number(process.env.GLOBAL_PAGE_ROWS)
        const count = PAGE_ROWS;

        // Allowed sort columns
        const validSortColumns = ['date', 'case_id', 'status', 'assigne'];
        const validSortOrders = ['asc', 'desc'];

        // Validate column and order
        const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
        ? sort_by
        : 'case_id';

        const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
        ? sort_order.toUpperCase()
        : 'DESC';

        // Logging
        logger.info(`Request reached from host ${clientIp} for work-flow-get worker history and request packet:`);
        console.log(`Request reached from host ${clientIp} for work-flow-get worker history and request packet:`);
        logger.info(body);
        console.log(body);
        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && workerName && filterFlag && business_id !== "" && workerName !== "" && filterFlag!=="") {
            // Start database transactions
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection(); // Get a connection from the pool
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get worker history
            //qurey bulding
        logger.info("Query variables are defined for building queries.");
        const queryConditions = [];
        const queryParams = [];

        if (case_id) {
            logger.info(`Case ID ${case_id} is pushed`);
            queryConditions.push("case_id = ?");
            queryParams.push(case_id);
        }

        if (fromDate) {
            logger.info(` fromDate ${fromDate} is pushed`);
            queryConditions.push("DATE(date) >= ?");
            queryParams.push(fromDate);
        }

        if (endDate) {
            logger.info(`endDate ${endDate} is pushed`);
            queryConditions.push("DATE(date) <= ?");
            queryParams.push(endDate);
        }
        if (work_status) {
            logger.info(`endDate ${work_status} is pushed`);
            queryConditions.push("status = ?");
            queryParams.push(work_status);
        }
        // Create query condition string by joining the conditions with 'AND'
        logger.info("query condition string is defined.");
        const queryConditionString = queryConditions.length > 0 ? queryConditions.join(' AND ') : '1'; // Default to '1' if no conditions

        const paginatedQuery =`SELECT date, case_id, status, assigne 
                 FROM work_flow_management 
                 WHERE ${queryConditionString} AND business_id = ? AND assigne = ? 
                 ORDER BY ${sortBy} ${sortOrder} 
                 LIMIT ? OFFSET ?`
        const paginatedParams = [...queryParams, business_id, workerName, count, (page_number - 1) * count];


        if(filterFlag == "true"){

            const [rows] = await connection.query(paginatedQuery, paginatedParams);
                // Send success response
                res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got all worker history successfully',
                params: rows,
            });
            logger.info("Got all worker history successfully");
            console.log("Got all worker history successfully");

        }else if(filterFlag == "false"){
            const [rows] = await connection.query(
                `SELECT date, case_id, status, assigne 
                 FROM work_flow_management 
                 WHERE business_id = ? AND assigne = ? 
                 ORDER BY ${sortBy} ${sortOrder} 
                 LIMIT ? OFFSET ?`,
                [business_id, workerName, count, (page_number - 1) * count]
            );

            // Send success response
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got all worker history successfully',
                params: rows,
            });
            logger.info("Got all worker history successfully");
            console.log("Got all worker history successfully");
        }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};
//get all users
exports.usersGetAlllUsers = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, page_number,PAGE_ROWS } = body;
        const count = parseInt(PAGE_ROWS,10);

        // Logging
        logger.info(`Request reached from host ${clientIp} for users get all users and request packet:`);
        console.log(`Request reached from host ${clientIp} for users get all users and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && page_number && business_id !== "" && page_number !== "") {
            // Start database transactions
            connection = await pool.promise().getConnection(); // Get a connection from the pool

            // Query to get all users
            const [rows] = await connection.query(
                "SELECT full_name,e_mail,status,role_index,profile_pic FROM `master-users` WHERE business_id = ? ORDER BY create_date ASC LIMIT ? OFFSET ?",
                [business_id, count, (page_number - 1) * count]
            );

            // Modify rows for response
            logger.info('Modifying user role and status values in fetched rows');
            console.log('Modifying user role and status values in fetched rows');
            const modifiedRows = rows.map(row => {
                if (row.status === 1) {
                    row.status = 'ACTIVE';
                } else {
                    row.status = 'AWAY';
                }

                switch (row.role_index) {
                    case 0:
                        row.role_index = 'ADMINISTRATOR';
                        break;
                    case 1:
                        row.role_index = 'ENGINEER';
                        break;
                    case 2:
                        row.role_index = 'FRONT OFFICER';
                        break;
                    case 3:
                        row.role_index = 'SALES HEAD';
                        break;
                    case 4:
                        row.role_index = 'SALES PERSON';
                        break;
                    case 5:
                        row.role_index = 'INVENTORY MASTER';
                        break;
                    default:
                        break;
                }

                return row;
            });
            logger.info(`Modified ${modifiedRows.length} user records successfully`);
            console.log(`Modified ${modifiedRows.length} user records successfully`);
            // Send success response
            res.send({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'Got all users successfully',
                params: modifiedRows,
            });
            logger.info("Got all users successfully");
            console.log("Got all users successfully");

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

exports.usersUpdateUser = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        const { business_id, user_name, image_name, email, phone_no, role_index } = body;
        const filePath = `${MEDIA_URL}/${image_name}`;

        // Logging
        logger.info(`Request reached from host ${clientIp} for update user and request packet:`);
        console.log(`Request reached from host ${clientIp} for update user and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && user_name && image_name && email && phone_no && role_index && business_id !== "" && user_name !== "" && image_name !== "" && email !== "" && phone_no !== "" && role_index !== "") {

            // Phone number validation (length check)
            const lengthRegex = /^\d{10}$/;
            if (lengthRegex.test(phone_no)) {

                // Start database transactions
                logger.info("Requesting database connection from pool.");
                console.log("Requesting database connection from pool.");
                connection = await pool.promise().getConnection(); // Get a connection from the pool
                logger.info("Database connection established successfully.");
                console.log("Database connection established successfully.");
                // Update user details in the database
                const [result] = await connection.query(
                    'UPDATE `master-users` SET full_name = ?, profile_pic = ?, role_index = ? WHERE business_id = ? AND e_mail = ?',
                    [user_name, filePath, role_index, business_id, email]
                );

                // Send success response
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Updated the user details",
                });
                logger.info("Updated the user details");
                console.log("Updated the user details");

            } else {
                logger.error('Not a valid phone number');
                console.error('Not a valid phone number');
                const error = new Error('Not a valid phone number');
                error.code = 'F003';
                throw error;
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//user termination
exports.usersTerminateAccount = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        const { business_id, relam_id, email, salve_id } = body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for terminate user and request packet:`);
        console.log(`Request reached from host ${clientIp} for terminate user and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && email && salve_id !== undefined && relam_id && business_id !== "" && email !== "" && salve_id !== "" && relam_id !== "") {

            // Establish database connection
            connection = await pool.promise().getConnection();

            if (salve_id == 0) {
                // Master user termination

                // Remove user from master-users table
                await connection.query('DELETE FROM `master-users` WHERE business_id = ?', business_id);
                logger.info("MASTER USER DELETION SUCCESSFUL");
                console.log("MASTER USER DELETION SUCCESSFUL");

                // Remove cases from case_registry
                await connection.query('DELETE FROM `case_registry` WHERE business_id = ?', business_id);
                logger.info("Removed all cases from directory");
                console.log("Removed all cases from directory");

                // Remove party details from party_details
                await connection.query('DELETE FROM `party_details` WHERE business_id = ?', business_id);
                logger.info("Removed all existing parties");
                console.log("Removed all existing parties");

                // Remove realm details from relam_master
                await connection.query('DELETE FROM `relam_master` WHERE relam_id = ?', relam_id);
                logger.info("Removed realm details");
                console.log("Removed realm details");

                // Remove work flow from work_flow_management
                await connection.query('DELETE FROM `work_flow_management` WHERE business_id = ?', business_id);
                logger.info("Removed all works from work flow");
                console.log("Removed all works from work flow");
                // Success response for master user termination
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Terminated master user successfully"
                });
                logger.info("Terminated master user successfully");
                console.log("Terminated master user successfully");

            } else {
                // Slave user termination

                // Remove user from master-users table
                await connection.query('DELETE FROM `master-users` WHERE business_id = ? AND e_mail = ?', [business_id, email]);
                logger.info("Slave user deletion successful");
                console.log("Slave user deletion successful");

                // Success response for slave user termination
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "User deleted successfully"
                });
                logger.info("Slave user deleted successfully");
                console.log("Slave user deleted successfully");
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};


//open work getassigned works
exports.openWorkGetAssignedWork = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, email_id, page_number,sort_by,sort_order } = body;
        const PAGE_ROWS = Number(process.env.GLOBAL_PAGE_ROWS)
        const count = PAGE_ROWS;

        // Allowed sort columns
        const validSortColumns = ['date', 'case_id',];
        const validSortOrders = ['asc', 'desc'];

        // Validate column and order
        const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
        ? sort_by
        : 'case_id';

        const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
        ? sort_order.toUpperCase()
        : 'DESC';

        // Logging
        logger.info(`Request reached from host ${clientIp} for open work and request packet:`);
        console.log(`Request reached from host ${clientIp} for open work and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && email_id && page_number && business_id !== "" && email_id !== "" && page_number !== "") {

            // Establish database connection
            connection = await pool.promise().getConnection();

            // Get the user name from master-users table
            const [userRows] = await connection.query('SELECT userName FROM `master-users` WHERE e_mail = ? AND business_id = ?', [email_id, business_id]);
            if (userRows.length === 0) {
                throw new Error('User not found');
            }

            const user_name = userRows[0].userName;
            logger.info(`User found: ${user_name}`);
            console.log(`User found: ${user_name}`);

            // Get assigned work
            const [assignedWorks] = await connection.query(`
                SELECT 
                    \`case_registry\`.customer_name,
                    \`case_registry\`.case_id,
                    \`case_registry\`.date,
                    \`work_flow_management\`.status 
                FROM 
                    \`case_registry\` 
                INNER JOIN 
                    \`work_flow_management\` 
                ON 
                    \`case_registry\`.case_id = \`work_flow_management\`.case_id 
                WHERE 
                    \`case_registry\`.business_id = ? 
                    AND \`work_flow_management\`.business_id = ? 
                    AND \`case_registry\`.assigne = ? 
                    AND \`work_flow_management\`.status IN ('RETURN', 'INPROGRESS', 'REPEAT', 'CREATED') 
                ORDER BY ${sortBy} ${sortOrder}
                LIMIT ? OFFSET ?`, 
                [business_id, business_id, user_name, count, (page_number - 1) * count]
            );

            res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Get all assigned works",
                params: assignedWorks
            });
            logger.info("Assigned works retrieved successfully");
            console.log("Assigned works retrieved successfully");

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: { code: err.code || 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//exr1
exports.experianceCustomerDetails = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, customer_name } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && customer_name && business_id !== "" && customer_name !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");

            // Query to get customer details from party_details table
            const [rows] = await connection.query('SELECT id, customer_name, phone_number, email,billing_adress FROM `party_details` WHERE customer_name LIKE ? AND business_id = ?', [`%${customer_name}%`, business_id]);

            if (rows.length >= 1) {
                // If customer found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get Party details successfully",
                    param: rows
                });
                logger.info("Customer details retrieved successfully");
                console.log("Customer details retrieved successfully");
            } else {
                // If no matching customer found
                logger.error("No party available");
                console.error("No party available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No party available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//open nworks get work
exports.experianceCustomerItem = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, itam_name } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience get item and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience get item and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && itam_name && business_id !== "" && itam_name !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get item details from item_information table
            const [rows] = await connection.query('SELECT DISTINCT item_name FROM `item_information` WHERE item_name LIKE ?', [`%${itam_name}%`]);

            if (rows.length >= 1) {
                // If item found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get item details successfully",
                    param: rows
                });
                logger.info("Item details retrieved successfully");
                console.log("Item details retrieved successfully");
            } else {
                // If no matching item found
                logger.error("No item available");
                console.error("No item available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No item available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//open nworks get work
exports.experianceCustomerBrand = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, brand_name } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for get brand and request packet:`);
        console.log(`Request reached from host ${clientIp} for get brand and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && brand_name && business_id !== "" && brand_name !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get brand details from item_information table
            const [rows] = await connection.query('SELECT DISTINCT brand FROM `item_information` WHERE brand LIKE ?', [`%${brand_name}%`]);

            if (rows.length >= 1) {
                // If brand found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get brand details successfully",
                    param: rows
                });
                logger.info("Brand details retrieved successfully");
                console.log("Brand details retrieved successfully");
            } else {
                // If no matching brand found
                logger.error("No brand available");
                console.error("No brand available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No brand available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};


//open nworks get work
exports.experianceCustomerModel = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, model } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for get item model and request packet:`);
        console.log(`Request reached from host ${clientIp} for get item model and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && model && business_id !== "" && model !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get model details from item_information table
            const [rows] = await connection.query('SELECT DISTINCT model FROM `item_information` WHERE model LIKE ?', [`%${model}%`]);

            if (rows.length >= 1) {
                // If model found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get model details successfully",
                    param: rows
                });
                logger.info("Model details retrieved successfully");
                console.log("Model details retrieved successfully");
            } else {
                // If no matching model found
                logger.error("Model details not available");
                console.error("Model details not available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Model details not available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//open nworks get work
exports.experianceCustomerAssigne = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, assigne } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for Assigne and request packet:`);
        console.log(`Request reached from host ${clientIp} for Assigne and request packet:`);
        logger.info(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && assigne && business_id !== "" && assigne !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get assigne details from master-users table
            const [rows] = await connection.query('SELECT DISTINCT userName, profile_pic FROM `master-users` WHERE userName LIKE ? AND business_id = ?', [`%${assigne}%`, business_id]);

            if (rows.length >= 1) {
                // If assigne found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get Assigne details successfully",
                    param: rows.map(user => ({
                    userName: user.userName,
                    profile_pic: user.profile_pic || "http://localhost:5080/Medias/user.png" 
            }))
                });
                logger.info("Assigne details retrieved successfully");
                console.log("Assigne details retrieved successfully");
            } else {
                // If no matching assigne found
                logger.error("Assigne details not available");
                console.error("Assigne details not available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Assigne details not available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//Case id
exports.experianceCustomerCaseId = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, caseId } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for caseID and request packet:`);
        console.log(`Request reached from host ${clientIp} for caseID and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && caseId && business_id !== "" && caseId !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get caseId details from case_registry table
            const [rows] = await connection.query('SELECT DISTINCT case_id FROM `case_registry` WHERE case_id LIKE ? AND business_id = ?', [`%${caseId}%`, business_id]);

            if (rows.length >= 1) {
                // If caseId found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get caseids successfully",
                    param: rows
                });
                logger.info("Case ID details retrieved successfully");
                console.log("Case ID details retrieved successfully");
            } else {
                // If no matching caseId found
                logger.error("Case ID details not available");
                console.error("Case ID details not available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Case ID details not available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};
exports.experianceCustomerSerialNumber = async (req, res) => {
    let connection;
    try {
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, serialNumber } = body;
        console.log(body);

        logger.info(`Request reached from host ${clientIp} for serialNumber and request packet:`);
        logger.info(body);

        // Primary validation
        if (business_id && serialNumber && business_id !== "" && serialNumber !== "") {

            logger.info("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");

            // Query to get matching serial numbers
            const [rows] = await connection.query(
                'SELECT DISTINCT seial_number FROM `case_registry` WHERE seial_number LIKE ? AND business_id = ?',
                [`%${serialNumber}%`, business_id]
            );

            if (rows.length >= 1) {
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get serial numbers successfully",
                    param: rows
                });
                logger.info("Serial number details retrieved successfully");
            } else {
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Serial number details not available"
                });
                logger.error("Serial number details not available");
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};

//Product Name
exports.experianceProductName = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, productName } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for productName and request packet:`);
        console.log(`Request reached from host ${clientIp} for productName and request packet:`);
        logger.info(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && productName && business_id !== "" && productName !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            onsole.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get product details from inventory-product-master table
            const [rows] = await connection.query('SELECT product_name, part_no FROM `inventory-product-master` WHERE product_name LIKE ? AND business_id = ?', [`%${productName}%`, business_id]);

            if (rows.length >= 1) {
                // If product details found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get product details successfully",
                    param: rows
                });
                logger.info("Get Product details  successfully");
                console.log("Get Product details successfully");
            } else {
                // If no matching product details found
                logger.error("Product details not available");
                console.error("Product details not available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Product details not available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};



//Product Name
exports.experianceDealerName = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, delaerName } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for dealerName and request packet:`);
        console.log(`Request reached from host ${clientIp} for dealerName and request packet:`);
        logger.info(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && delaerName && business_id !== "" && delaerName !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get dealer details from dealer_details table
            const [rows] = await connection.query('SELECT company_name FROM `deler_details` WHERE company_name LIKE ? AND business_id = ?', [`%${delaerName}%`, business_id]);

            if (rows.length >= 1) {
                // If dealer details found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get dealer details successfully",
                    param: rows
                });
                logger.info("Dealer details retrieved successfully");
                console.log("Dealer details retrieved successfully");
            } else {
                // If no matching dealer details found
                logger.error("Dealer details not available");
                console.error("Dealer details not available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Dealer details not available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//Product Name
exports.experiancePhoneNumber = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, phoneNumber } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for dealerName and request packet:`);
        console.log(`Request reached from host ${clientIp} for dealerName and request packet:`);
        logger.info(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && phoneNumber && business_id !== "" && phoneNumber !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get dealer details from dealer_details table
            const [rows] = await connection.query('SELECT phone_number FROM `party_details` WHERE phone_number LIKE ? AND business_id = ?', [`%${phoneNumber}%`, business_id]);

            if (rows.length >= 1) {
                // If dealer details found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get details successfully",
                    param: rows
                });
                logger.info("details retrieved successfully");
                console.log("details retrieved successfully");
            } else {
                // If no matching dealer details found
                logger.error("details not available");
                console.error("details not available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "details not available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};
//phase 2 logic start here
//inventory adding new product
exports.inventoryAddProduct = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for add a new product to inventory and request packet:`);
        console.log(`Request reached from host ${clientIp} for add a new product to inventory and request packet:`);
        logger.info(body);
        console.log(body);

        // Parameterization
        const { product_name, part_no, product_description, deler, product_price, selling_price, stock, remarks, business_id } = body;
        const return_stock = 0;
        const return_price = 0;

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (product_name && part_no && deler && product_price && selling_price && stock && business_id && product_name !== "" && part_no !== "" && deler !== "" && product_price !== null && selling_price !== "" && stock !== "" && business_id !== "") {

            const currentTimestamp = moment();
            const formattedTimestamp = currentTimestamp.format('YYYY-MM-DD HH:mm:ss');
            logger.info(`Product data seems valid. Attempting to connect to the database.`); 
            console.log(`Product data seems valid. Attempting to connect to the database.`);

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");

            // Check if part_no is unique
            logger.info(`Fetching Inventory Product details with part number: ${part_no} and business ID: ${business_id}`);
            console.log(`Fetching Inventory Product details with part number: ${part_no} and business ID: ${business_id}`);
            const [existingProduct] = await connection.query('SELECT * FROM `inventory-product-master` WHERE part_no = ? AND business_id = ?', [part_no, business_id]);

            if (existingProduct.length > 0) {
                logger.error("Part number already exists");
                console.error("Part number already exists");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Part number already exists"
                });
            }
            logger.info(`Part number '${part_no}' is unique.`);
            console.log(`Part number '${part_no}' is unique.`);

            //dealer is exited or not
            logger.info(`Checking if dealer '${deler}' exists for business ID: ${business_id}.`);
            console.log(`Checking if dealer '${deler}' exists for business ID: ${business_id}.`);
            const [existingDealer] = await connection.query(
                'SELECT * FROM `deler_details` WHERE company_name = ? AND business_id = ?',
                [deler,business_id]
            )

            if(existingDealer.length === 0){
                logger.error(`Failed to add product: Dealer '${deler}' does not exist for business ID '${business_id}'.`);
                console.error(`Failed to add product: Dealer '${deler}' does not exist for business ID '${business_id}'.`);
                throw new Error('Dealer not exist')
            }
            logger.info(`Dealer '${deler}' exists.`);
            console.log(`Dealer '${deler}' exists.`);

            // Insert new product into inventory
            logger.info(`Inserting new product: ${product_name} with part_no: ${part_no} into inventory.`);
            console.log(`Inserting new product: ${product_name} with part_no: ${part_no} into inventory.`);
            const [result] = await connection.query(
                'INSERT INTO `inventory-product-master` (product_name, part_no, product_dsc, deler, product_price, selling_price, stock, return_stock, return_price, remarks, business_id, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [product_name, part_no, product_description, deler, product_price, selling_price, stock, return_stock, return_price, remarks, business_id, formattedTimestamp]
            );

            if (result.affectedRows > 0) {
                logger.info("New product added successfully");
                console.log("New product added successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "New product added successfully"
                });
            } else {
                logger.error("Failed to add new product");
                console.error("Failed to add new product");
                return res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "Failed to add new product"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory adding new product
exports.inventoryUpdateProduct = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for update product and request packet:`);
        console.log(`Request reached from host ${clientIp} for update product and request packet:`);
        logger.info(body);
        console.log(body);

        // Parameterization
        const { product_name, part_no, product_description, deler, product_price, selling_price, stock, remarks, business_id } = body;

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (product_name && part_no && deler && product_price && selling_price && stock && business_id && product_name !== "" && part_no !== "" && deler !== "" && product_price !== "" && selling_price !== "" && stock !== "" && business_id !== "null") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();

            //dealer is exited or not
            logger.info(`Checking if dealer '${deler}' exists for business ID: ${business_id} before update.`);
            console.log(`Checking if dealer '${deler}' exists for business ID: ${business_id} before update.`);
            const [existingDealer] = await connection.query(
                'SELECT * FROM `deler_details` WHERE company_name = ? AND business_id = ?',
                [deler,business_id]
            )

            if(existingDealer.length === 0){
                logger.error(`Failed to update product '${part_no}': Dealer '${deler}' does not exist for business ID '${business_id}'.`);
                console.log(`Failed to update product '${part_no}': Dealer '${deler}' does not exist for business ID '${business_id}'.`);
                throw new Error('Dealer not exist')
            }
            logger.info(`Dealer '${deler}' exists.`);
            console.log(`Dealer '${deler}' exists.`);

            // Update product in inventory
            logger.info(`Attempting to update product with part_no: ${part_no} and business_id: ${business_id}.`);
            console.log(`Attempting to update product with part_no: ${part_no} and business_id: ${business_id}.`);
            const [result] = await connection.query(
                'UPDATE `inventory-product-master` SET product_name = ?, product_dsc = ?, deler = ?, product_price = ?, selling_price = ?, stock = ?, remarks = ? WHERE part_no = ? AND business_id = ?',
                [product_name, product_description, deler, product_price, selling_price, stock, remarks, part_no, business_id]
            );

            if (result.affectedRows > 0) {
                logger.info("Product updated successfully");
                console.log("Product updated successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Product updated successfully"
                });
            } else {
                logger.error("Failed to update product: No rows affected");
                console.error("Failed to update product: No rows affected");
                return res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "Failed to update product"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory return
exports.inventoryReturn = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for return a product to inventory and request packet:`);
        console.log(`Request reached from host ${clientIp} for return a product to inventory and request packet:`);
        logger.info(body);
        console.log(body);

        // Parameterization
        const { part_no, return_stock, return_price, business_id } = body;

        // Primary validation
        if (part_no && return_stock && return_price && business_id && part_no !== "" && return_stock !== "" && return_price !== "" && business_id !== "") {
            // Establish database
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");

            // Get current stock
            const [rows] = await connection.query('SELECT stock FROM `inventory-product-master` WHERE part_no = ? AND business_id = ?', [part_no, business_id]);

            if (rows.length === 0) {
                logger.error("Product not found");
                console.error("Product not found");
                return res.status(404).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0016" },
                    message: "Product not found"
                });
            }

            const stock = rows[0].stock;
            const newStock = stock - return_stock;

            // Check if the new stock value is valid
            if (newStock < 0) {
                logger.error("Stock value should be positive");
                console.error("Stock value should be positive");
                return res.status(400).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Stock less than zero not allowed"
                });
            }

            // Update stock and return details
            const [updateResult] = await connection.query(
                'UPDATE `inventory-product-master` SET stock = ?, return_price = ?, return_stock = ? WHERE part_no = ? AND business_id = ?',
                [newStock, return_price, return_stock, part_no, business_id]
            );

            if (updateResult.affectedRows > 0) {
                logger.info("Product returned successfully");
                console.log("Product returned successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Product returned successfully"
                });
            } else {
                logger.error("Failed to update product stock");
                console.error("Failed to update product stock");
                return res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "Failed to update product stock"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory Point Of Sail
exports.inventoryPOSSail = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for POS Sail and request packet:`);
        console.log(`Request reached from host ${clientIp} for POS Sail and request packet:`);
        logger.info(body);
        console.log(body);

        // Parameterization
        const { part_no, business_id, case_id, instance_id } = body;

        // Primary validation
        logger.info("Starting primary validation for POS Sail.");
        console.log("Starting primary validation for POS Sail.");
        if (part_no && business_id && case_id && instance_id && part_no !== "" && business_id !== "" && case_id !== "" && instance_id !== "") {
            
            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully");
            console.log("Database connection established successfully");

            // Get product stock and details
            logger.info(`Fetching product stock and details for part_no: ${part_no} and business_id: ${business_id}.`);
            console.log(`Fetching product stock and details for part_no: ${part_no} and business_id: ${business_id}.`);
            const [rows] = await connection.query('SELECT stock, product_name, selling_price FROM `inventory-product-master` WHERE part_no = ? AND business_id = ?', [part_no, business_id]);

            if (rows.length === 0) {
                logger.error("No product mapped with the respected part number");
                console.error("No product mapped with the respected part number");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No product mapped with respected part number"
                });
            }

            const { stock, product_name, selling_price } = rows[0];
            const newStock = stock - 1;

            // Check if stock is available
            if (newStock < 0) {
                logger.error("Product not available in stock");
                console.error("Product not available in stock");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Product not available in stock"
                });
            }

            // Update stock in the database
            logger.info('Attempting to update stock');
            console.log('Attempting to update stock');
            const [updateResult] = await connection.query(
                'UPDATE `inventory-product-master` SET stock = ? WHERE part_no = ? AND business_id = ?',
                [newStock, part_no, business_id]
            );

            if (updateResult.affectedRows === 0) {
                logger.error("Failed to update stock");
                console.error("Failed to update stock");
                return res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "Failed to update stock"
                });
            }
            logger.info(`Stock updated successfully`);
            console.log(`Stock updated successfully`);

            // Insert product into job sheet
            logger.info(`inserting product into job sheet`);      
            console.log(`inserting product into job sheet`);     
            const [insertResult] = await connection.query(
                'INSERT INTO `inventory_product_job_sheet` (part_no, product_name, selling_price, business_id, case_id, instance_id) VALUES (?, ?, ?, ?, ?, ?)',
                [part_no, product_name, selling_price, business_id, case_id, instance_id]
            );

            if (insertResult.affectedRows > 0) {
                logger.info("Product added to job sheet successfully");
                console.log("Product added to job sheet successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Product added to job sheet successfully"
                });
            } else {
                logger.error("Failed to add product to job sheet");
                console.error("Failed to add product to job sheet");
                return res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "Failed to add product to job sheet"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory Point Of Sail Product Return
exports.inventoryPOSReturn = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for POS Return and request packet:`);
        console.log(`Request reached from host ${clientIp} for POS Return and request packet:`);
        logger.info(body);

        // Parameterization
        const { part_no, business_id, case_id, instance_id } = body;

        // Primary validation
        logger.info("Validating Request body");
        console.log("Validating request body");
        if (part_no && business_id && instance_id && part_no !== "" && business_id !== "" && instance_id !== "") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established successfully");
            console.log("database conncection established successfully");

            // Get product stock
            const [rows] = await connection.query('SELECT stock FROM `inventory-product-master` WHERE part_no = ? AND business_id = ?', [part_no, business_id]);

            if (rows.length === 0) {
                logger.error("Product not found in the inventory");
                console.error("Product not found in the inventory");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Product not found in the inventory"
                });
            }

            let stock = rows[0].stock;
            const newStock = stock + 1;

            // Update stock in the database
            const [updateResult] = await connection.query(
                'UPDATE `inventory-product-master` SET stock = ? WHERE part_no = ? AND business_id = ?',
                [newStock, part_no, business_id]
            );

            // if (updateResult.affectedRows === 0) {
            //     logger.error("Failed to update stock");
            //     return res.status(500).json({
            //         statusDesc: "Failure",
            //         statusCode: { code: "F005" },
            //         message: "Failed to update stock"
            //     });
            // }

            // Delete product from the job sheet
            const [deleteResult] = await connection.query(
                'DELETE FROM inventory_product_job_sheet WHERE part_no = ? AND business_id = ? AND case_id = ? AND instance_id = ?',
                [part_no, business_id, case_id, instance_id]
            );

            if (deleteResult.affectedRows > 0) {
                logger.info("Product returned to inventory successfully");
                console.log("Product returned to inventory successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Product returned to inventory successfully"
                });
            } else {
                logger.error("Failed to remove product from job sheet");
                console.error("Failed to remove product from job sheet");
                return res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "Failed to remove product from job sheet"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory Point Of Sail Product Return
exports.inventoryPOSRGetProduct = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, case_id } = body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for POS Getting a product and request packet:`);
        console.log(`Request reached from host ${clientIp} for POS Getting a product and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        if (business_id && case_id && business_id !== "" && case_id !== "") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            // Query to get product details from job sheet
            const [rows] = await connection.query(
                'SELECT part_no, product_name, selling_price, instance_id FROM `inventory_product_job_sheet` WHERE business_id = ? AND case_id = ?',
                [business_id, case_id]
            );

            if (rows.length > 0) {
                logger.info(`Got product details: ${JSON.stringify(rows)}`);
                console.log(`Got product details: ${JSON.stringify(rows)}`);
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Got product details successfully",
                    params: rows
                });
            } else {
                logger.error("No product mapped with the respective part number");
                console.error("No product mapped with the respective part number");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No product mapped with the respective part number"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory get product list
exports.inventoryGetProductList = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, page_number } = body;
        const count = PAGE_ROWS;

        // Logging
        logger.info(`Request reached from host ${clientIp} for inventory get all products request packet:`);
        console.log(`Request reached from host ${clientIp} for inventory get all products request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id && business_id !== "" && page_number && page_number !== "") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            // Query to get product list
            const [rows] = await connection.query(
                `SELECT product_name, part_no, deler, product_price, selling_price, stock, return_stock, return_price
                 FROM \`inventory-product-master\`
                 WHERE business_id = ? AND part_no != "0000"
                 GROUP BY product_name, part_no, deler, product_price, selling_price, stock, return_stock, return_price
                 ORDER BY id DESC
                 LIMIT ? OFFSET ?`,
                [business_id, count, (page_number - 1) * count]
            );

            if (rows.length > 0) {
                logger.info("Got product details successfully");
                console.log("Got product details successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Got product details successfully",
                    params: rows
                });
            } else {
                logger.error("No products found");
                console.error("No products found");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No products found"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory get product list
exports.inventoryGetProductWithPartNo = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        // Logging
        logger.info(`Request reached from host ${clientIp} for inventory get product with part no and request packet:`);
        console.log(`Request reached from host ${clientIp} for inventory get product with part no and request packet:`);
        logger.info(body);
        console.log(body);

        const { business_id, part_no } = body;

        // Primary validation
        if (business_id && part_no && business_id !== "" && part_no !== "") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            // Query to get product details by part_no and business_id
            const [rows] = await connection.query(
                `SELECT product_name, part_no, product_dsc, deler, product_price, selling_price, stock, return_stock, return_price, remarks, date
                 FROM \`inventory-product-master\`
                 WHERE part_no = ? AND business_id = ?`,
                [part_no, business_id]
            );

            if (rows.length > 0) {
                logger.info("Data retrieved successfully");
                console.log("Data retrieved successfully");

                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Got product details with product id",
                    param: { product_data: rows[0] }
                });
            } else {
                logger.error("No product found for the provided part_no and business_id");
                console.error("No product found for the provided part_no and business_id");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No product found for the provided part number"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory get product list
exports.CreateCaseId = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        // Logging
        logger.info(`Request reached from host ${clientIp} for case ID generation and request packet:`);
        console.log(`Request reached from host ${clientIp} for case ID generation and request packet:`);
        logger.info(body);
        console.log(body);

        const { business_id } = body;

        // Primary validation
        if (!business_id) {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

        // Function to generate the case ID
        function generateCaseId(sequence = 1) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const datePart = `${year}${month}${day}`;
            const sequencePart = String(sequence).padStart(4, '0');
            return `${datePart}${sequencePart}`;
        }

        const caseFlag = 1;
        const stringValue = generateCaseId();

        // Establish database connection
        logger.info("getting database connection");
        console.log("getting database connection");       
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        // Insert case ID details into the database
        const [result] = await connection.query(
            'INSERT INTO `case_id_details` (business_id, case_flag, string_value) VALUES (?, ?, ?)',
            [business_id, caseFlag, stringValue]
        );

        res.send({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "Case ID details generated successfully"
        });

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory get product list
exports.caseIdStatus = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        // Logging
        logger.info(`Request reached from host ${clientIp} for case ID status update and request packet:`);
        console.log(`Request reached from host ${clientIp} for case ID status update and request packet:`);
        logger.info(body);
        console.log(body);

        const { business_id, caseFlag } = body;

        // Primary validation
        if (!business_id || !caseFlag) {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

        // Establish database connection
        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        // Update case flag in the database
        const [result] = await connection.query(
            'UPDATE `case_id_details` SET case_flag = ? WHERE business_id = ?',
            [caseFlag, business_id]
        );

        res.send({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "Case Flag Updated Successfully"
        });

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory get product list
exports.caseIdCheckStatus = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        // Logging
        logger.info(`Request reached from host ${clientIp} for case ID status check and request packet:`);
        console.log(`Request reached from host ${clientIp} for case ID status check and request packet:`);
        logger.info(body);
        console.log(body);

        const { business_id } = body;

        // Primary validation
        if (!business_id) {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

        // Establish database connection
        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        // Query to get case flag for the given business_id
        const [rows] = await connection.query(
            'SELECT case_flag FROM `case_id_details` WHERE business_id = ?',
            [business_id]
        );

        if (rows.length >= 1) {
            res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got Case ID status Successfully",
                param: { data: rows }
            });
            logger.info("Got Case ID status Successfully");
            console.log("Got Case ID status Successfully");
        } else {
            res.status(404).json({
                statusDesc: "Failure",
                statusCode: { code: "F001" },
                message: "No case ID found for the provided business ID"
            });
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory get product list
exports.caseIdGenerateNew = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        // Logging
        logger.info(`Request reached from host ${clientIp} for case ID generation and request packet:`);
        console.log(`Request reached from host ${clientIp} for case ID generation and request packet:`);
        logger.info(body);
        console.log(body);

        const { business_id } = body;

        // Primary validation
        if (!business_id) {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

        // Establish database connection
        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        // Query to get the current string_value (case ID)
        const [rows] = await connection.query(
            'SELECT string_value FROM `case_id_details` WHERE business_id = ?',
            [business_id]
        );

        if (rows.length >= 1) {
            const previousCaseId = rows[0].string_value;

            // Generate new case ID by incrementing the previous one
            const newCaseId = (parseInt(previousCaseId) + 1).toString();

            // Respond with the newly generated case ID
            res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Case ID generated successfully",
                param: { case_id: newCaseId }
            });
            logger.info("Case ID generated successfully");
            console.log("Case ID generated successfully");

        } else {
            // If no rows are found, return an error
            res.status(404).json({
                statusDesc: "Failure",
                statusCode: { code: "F001" },
                message: "No case ID found for the provided business ID"
            });
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//inventory get product list
exports.caseIdUpdateCaseId = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        // Logging
        logger.info(`Request reached from host ${clientIp} for case ID update and request packet:`);
        console.log(`Request reached from host ${clientIp} for case ID update and request packet:`);
        logger.info(body);
        console.log(body);

        const { business_id, case_id } = body;

        // Primary validation
        if (!business_id || !case_id) {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

        // Call the external API to check case flag
        const caseFlagResponse = await axios.get(`${BASE_URL}/caseIdCheckStatus?business_id=${encodeURIComponent(business_id)}`);
        logger.info("Internal call successful:", caseFlagResponse.data);
        console.log("Internal call successful:", caseFlagResponse.data);

        const caseFlag = caseFlagResponse.data?.param?.data?.[0]?.case_flag;

        if (caseFlag === 1) {
            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            // Update the case ID in the database
            const [result] = await connection.query(
                'UPDATE `case_id_details` SET string_value = ? WHERE business_id = ?;',
                [case_id, business_id]
            );

            // Respond with success
            res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Case ID Updated Successfully"
            });
            logger.info("Case ID updated successfully");
            console.log("Case ID updated successfully");

        } else if (caseFlag === 0) {
            // If case flag is 0, respond with success without updating
            res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Case ID Updated Successfully"
            });
            logger.info("Case ID updated successfully (flag was 0)");
            console.log("Case ID updated successfully (flag was 0)");

        } else {
            // Handle case where case flag is undefined or unexpected
            res.status(400).json({
                statusDesc: "Failure",
                statusCode: { code: "F002" },
                message: "Invalid case flag"
            });
        }

    } catch (err) {
        // Handle errors
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure connection is released
    }
};

//generate Bar code
exports.generateBarCode = async (req, res) => {
    let connection;
    try {
        const body = req.query;
        logger.info('Starting barcode generation', { queryParams: body });
        console.log('Starting barcode generation', { queryParams: body });

        // Extract parameters from the request
        const { case_id, business_id, productName, size } = body;
        const barcodeText = `PRODUCT : ${productName}`;
        const totalBarcodes = parseInt(size); // Total number of barcodes

        if (case_id && totalBarcodes && business_id) {
            logger.info('Valid parameters received - proceeding with barcode generation');
            console.log('Valid parameters received - proceeding with barcode generation');

            // Wrap the database query in a promise
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
             logger.info('Database connection established');
             console.log('Database connection established');
            const [rows] = await connection.query(
                'SELECT colums, left_margin, top_margin, horizontal_margin, vertical_margin, page_width, label_width, label_heigth FROM `bar_code_custome_deatails` WHERE business_id=?', 
                [business_id]
            );

            if (rows.length >= 1) {

                const mmToPoints = 2.83465;

                const columns = parseInt(rows[0].colums) || 2;
                const leftMargin = parseFloat(rows[0].left_margin) || 7; 
                const topMargin = parseFloat(rows[0].top_margin) || 5;
                const horizontalMargin = parseFloat(rows[0].horizontal_margin) || 5;
                const verticalMargin = parseFloat(rows[0].vertical_margin) || 5;

                const pageWidth = rows[0].page_width * mmToPoints;
                const labelWidth = rows[0].label_width * mmToPoints;
                const labelHeight = rows[0].label_heigth * mmToPoints;

                // Conversion factor: 1 mm = 2.83465 points
                const leftMarginPoints = leftMargin * mmToPoints;
                const topMarginPoints = topMargin * mmToPoints;
                const xSpacing = horizontalMargin * mmToPoints;
                const ySpacing = verticalMargin * mmToPoints;
                const padding = 2 * mmToPoints;
                const barcodeWidth = labelWidth - 2 * padding;
                const barcodeHeight = labelHeight - 2 * padding;
                const rowsCount = Math.ceil(totalBarcodes / columns);
                const requiredHeight = topMarginPoints + rowsCount * (labelHeight + ySpacing);

                const doc = new PDFDocument({ size: [pageWidth, requiredHeight], margin: 0 });
                let buffers = [];
                doc.on('data', chunk => buffers.push(chunk));
                doc.on('end', () => {
                    logger.info('PDF generation completed successfully');
                    console.log('PDF generation completed successfully');
                    const pdfData = Buffer.concat(buffers);
                    res.set({
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `inline; filename="labels_${case_id}.pdf"`,
                        'Content-Length': pdfData.length,
                    });
                    res.send(pdfData);
                });

                // Generate barcode as an image buffer
                logger.info('Starting barcode image generation');
                console.log('Starting barcode image generation');
                const barcodeBuffer = await new Promise((resolve, reject) => {
                    bwipjs.toBuffer(
                        {
                            bcid: 'code128',        
                            text: case_id,          
                            scale: 2,              
                            height: 15,            
                            includetext: true,     
                            textxalign: 'center',  
                            textsize: 8,           
                        },
                        (err, png) => {
                            if (err) reject(err);           
                            else resolve(png);    
                            
                        }
                    );
                });

                let x = leftMarginPoints;
                let y = topMarginPoints;

                for (let i = 0; i < totalBarcodes; i++) {
                // Draw barcode at fixed position inside label
                doc.image(
                    barcodeBuffer,
                    x + padding,
                    y + padding,
                    { width: barcodeWidth, height: barcodeHeight }
                );

                // Draw text below barcode (inside label)
                doc.fontSize(7).text(
                    barcodeText,
                    x + padding,
                    y + padding + barcodeHeight + 1, // 1pt gap under barcode
                    {
                        width: barcodeWidth,
                        align: 'center'
                    }
                );

                // Move to next column
                x += labelWidth + xSpacing;

                // If end of row, reset X and move down
                if ((i + 1) % columns === 0) {
                    x = leftMarginPoints;
                    y += labelHeight + ySpacing;
                }
            }

                doc.end();

            } else {
                throw new Error("Database returned no data for the given business_id.");
            }

        } else {
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error(err);
        console.error(err);
        res.status(400).json({
            statusDesc: 'Failure',
            statusCode: err.code || 'UNKNOWN',
            message: err.message,  // Ensure message is passed correctly from error
        });
    } finally {
        if (connection) connection.release(); // Ensure connection is released
    }
};

//generate Bar code
exports.getBarcodeDetails = async (req, res) => {
    let connection;
    try {
        const body = req.query;
        const business_id = body.business_id;

        if (business_id) {
            // Using async/await for the database query
            connection = await pool.promise().getConnection();
            const [rows] = await connection.query(
                'SELECT colums, left_margin, top_margin, horizontal_margin, vertical_margin, page_width, label_width, label_heigth FROM `bar_code_custome_deatails` WHERE business_id=?', 
                [business_id]
            );

            if (rows.length >= 1) {
                res.send({
                    "statusDesc": "Success",
                    "statusCode": {
                        "code": "SC000"
                    },
                    "message": "Got Case ID status Successfully",
                    "param": {
                        "data": rows
                    }
                });
                logger.info("Got bar code details Successfully");
                console.log("Got bar code details Successfully");
            } else {
                throw new Error("No barcode details found for the given business_id.");
            }
        } else {
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }
    } catch (err) {
        logger.error(err);
        console.error(err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": err.code || 'UNKNOWN',
            "message": err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure connection is released
    }
};

//generate Bar code
exports.updateBarcodeDetails = async (req, res) => {
    let connection;
    try {
        const body = req.body;

        const business_id = body.business_id;
        const colums = body.colums;
        const leftMargin = body.left_margin;
        const topMargin = body.top_margin;
        const horizontalMargin = body.horizontal_margin;
        const verticalMargin = body.vertical_margin;
        const pageWidth = body.page_width;
        const labelWidth = body.label_width;
        const labelHeight = body.label_heigth;

        if (business_id && colums && leftMargin && topMargin && horizontalMargin && verticalMargin) {
            // Using async/await for the database query
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");
            const [result] = await connection.query(
                'UPDATE bar_code_custome_deatails SET colums = ?, left_margin = ?, top_margin = ?, horizontal_margin = ?, vertical_margin = ?, page_width = ?, label_width = ?, label_heigth = ? WHERE business_id = ?',
                [colums, leftMargin, topMargin, horizontalMargin, verticalMargin, pageWidth, labelWidth, labelHeight, business_id]
            );

            res.status(200).json({
                "statusDesc": "Success",
                "statusCode": {
                    "code": "SC000"
                },
                "message": "Saved the changes",
            });
            logger.info("Barcode details updated successfully.");
            console.log("Barcode details updated successfully.");
        } else {
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }
    } catch (err) {
        logger.error(err);
        console.error(err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": err.code || 'UNKNOWN',
            "message": err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure connection is released
    }
};

//experience customer name in invocie and credit note
exports.experiencecustomername = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, customer_name } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        if (business_id && customer_name && business_id !== "" && customer_name !== "") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            // Query to get customer details from party_details table
            const [rows] = await connection.query('SELECT id, customer_name, phone_number, billing_adress FROM `party_details` WHERE customer_name LIKE ? AND business_id = ?', [`%${customer_name}%`, business_id]);

            if (rows.length >= 1) {
                // If customer found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get Party details successfully",
                    param: rows
                });
                logger.info("Customer details retrieved successfully");
                console.log("Customer details retrieved successfully");
            } else {
                // If no matching customer found
                logger.error("No party available");
                console.error("No party available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No party available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//Adding new party details
exports.addNewParty = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
            customer_name: Joi.string().required(),
            customer_phone_number: Joi.string().required(),
            billing_adress: Joi.string().required(),
            business_id: Joi.string().required()
        });
        let buyer_id = 0

        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { customer_name, customer_phone_number, billing_adress, business_id } = req.body;

        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        //checking party is existed or not 
        // Validate dealer
        const [existingParty] = await connection.query(
            'SELECT * FROM `party_details` WHERE phone_number = ? AND business_id = ?',
            [customer_phone_number, business_id]
        );

        if (existingParty.length === 0) {
            const [insertParty] = await connection.query(
                'INSERT INTO `party_details` (customer_name, phone_number, email, alternate_phone_number, business_id, billing_adress) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    customer_name,
                    customer_phone_number,
                    "email",
                    "+91",
                    business_id,
                    billing_adress
                ]
            );
            buyer_id = insertParty.insertId;
            //new customer visit
            //New customer posting journals
            //calling event Api
            logger.info("Calling API for oldcustomer journal");
            console.log("Calling API for oldcustomer journal");
            const payload = {
                new_customers: 1,
                old_customers: 0,
                due_collected:0,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });

            res.status(200).json({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'New party added added successfully',
                data: { party_id: buyer_id }
            });
        }else{
            buyer_id = existingParty[0].id;
            logger.info(`Existing party found (ID: ${buyer_id}). Updating details if needed.`);
            console.log(`Existing party found (ID: ${buyer_id}). Updating details if needed.`);
            await connection.query(
                `UPDATE party_details 
                SET customer_name = ?,billing_adress = ? 
                WHERE id = ? AND business_id = ?`,
                [customer_name,billing_adress, buyer_id, business_id]
            );
            //New customer posting journals
            //calling event Api
            logger.info("Calling API for oldcustomer journal");
            console.log("Calling API for oldcustomer journal");
            const payload = {
                new_customers: 0,
                old_customers: 1,
                due_collected:0,
                business_id: business_id
            };
            logger.info("payload created");
            console.log("Payload created");

            //calling mail sender
            axios.post(`${INTEL_URL}/intel-svc/api/v1/creteJournal`, payload)
            .then(response => {
                logger.info(`API sent successfully:', ${response.data}`);
                console.log('API sent successfully:', response.data);
            })
            .catch(error => {
                logger.error(`Error sending API:', ${error}`);
                console.error('Error sending API:', error);
            });

            res.status(200).json({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'New party alredy existed',
                data: { party_id: buyer_id }
            });
        }

    } catch (err) {
        logger.error(`Error in updateSerialStatus: ${err.message}`);
        console.error(`Error in updateSerialStatus: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

//adding new partner 
exports.createnewpartner = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;
        
        // Logging
        logger.info(`Request reached from host ${clientIp} for add new dealer and request packet:`);
        console.log(`Request reached from host ${clientIp} for add new dealer and request packet:`);
        logger.info(body);
        console.log(body);

        // Parameterization
        const { partner_name, partner_type,contact_person, contact_number, email, address,description,gstin, business_id } = body;
        const partNo = "0000";

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (partner_name && partner_type && contact_person && contact_number && business_id && partner_name !== "" && partner_type !== "" && contact_person !== "" && contact_number !== "" && business_id !== "") {

            // Phone number validation
            const lengthRegex = /^\d{10}$/;
            if (lengthRegex.test(contact_number)) {

                // Establish database connection
                logger.info("getting database connection");
                console.log("getting database connection");
                connection = await pool.promise().getConnection();
                logger.info("database connection established");
                console.log("database connection established");

                // Check if dealer already exists
                const [rows] = await connection.query('SELECT * FROM `core_partner_details` WHERE partner_name = ? AND business_id = ?', [partner_name, business_id]);
                
                if (rows.length >= 1) {
                    // Dealer already exists
                    logger.error("Partner already exists");
                    console.error("Partner already exists");
                    res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "F0015" },
                        message: "Dealer already exists"
                    });
                } else {
                    // Insert new dealer
                    await connection.query('INSERT INTO `core_partner_details` (partner_name,partner_type,contact_person, contact_number, email, gstin,address, description, business_id) VALUES (?,?,?, ?, ?, ?, ?, ?, ?)', 
                        [partner_name, partner_type, contact_person,contact_number, email, gstin, address,description,business_id]);


                    logger.info("New Business Partner added successfully");
                    console.log("New Business Partner added successfully");
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "New partner added successfully"
                    });
                }

            } else {
                logger.error("Primary validation error: Not a valid phone number");
                console.error("Primary validation error: Not a valid phone number");
                const error = new Error("Not a valid phone number");
                error.code = "F0011";
                throw error;
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//Partner get partner details
    exports.getpartnerlist = async (req, res) => {
        let connection;
           try {

        //input validation
        const schema = Joi.object({
            partner_name: Joi.string().allow(null, ''),
            partner_type: Joi.string().allow(null, ''),
            page_number: Joi.number().integer().required(),
            business_id: Joi.string().required(),
            PAGE_ROWS: Joi.number().integer().required(),

        });
        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        //getting connetion
        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");
        
        

        const {business_id,partner_name,page_number,partner_type,PAGE_ROWS} = req.query
        const count =parseInt(PAGE_ROWS,10);
        //condition check
        if(partner_name == "" && partner_type == ""){
           //no filter condition 
           // Query to get dealer details
           const [rows] = await connection.query(
                `SELECT  
                    partner_name,
                    core_partner_type_details.type_name AS partner_type,
                    contact_person,
                    contact_number
                FROM core_partner_details
                JOIN core_partner_type_details 
                    ON core_partner_details.partner_type = core_partner_type_details.type_id
                WHERE core_partner_details.business_id = ?
                LIMIT ? OFFSET ?;`,
                    [business_id, count, (page_number - 1) * count]
            );
            if (rows.length > 0) {
                logger.info("Got partner details successfully");
                console.log("Got partner details successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Got product list successfully",
                    params: rows
                });
            } else {
                logger.error("No dealers found");
                console.error("No dealers found");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "SC000" },
                    message: "No product list found",
                    params: []
                });
            }
        }
        if(partner_name != "" && partner_type == ""){
                //product filtee
                const [rows] = await connection.query(
                    `SELECT  
                        partner_name,
                        core_partner_type_details.type_name AS partner_type,
                        contact_person,
                        contact_number
                    FROM core_partner_details
                    JOIN core_partner_type_details ON core_partner_details.partner_type = core_partner_type_details.type_id
                    WHERE core_partner_details.business_id = ?
                    AND core_partner_details.partner_name = ?
                    LIMIT ? OFFSET ?;`,
                    [business_id, partner_name,count,(page_number - 1) * count]
                );
                if (rows.length > 0) {
                    logger.info("Got dealer details successfully");
                    console.log("Got dealer details successfully");
                    return res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Got product list successfully",
                        params: rows
                    });
                } else {
                    logger.error("No dealers found");
                    console.error("No dealers found");
                    return res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "SC000" },
                        message: "No product list found",
                        params: []
                    });
                }
            }
        if(partner_name == "" && partner_type != ""){
                //product filtee
                const [rows] = await connection.query(
                    `SELECT  
                        partner_name,
                        core_partner_type_details.type_name AS partner_type,
                        contact_person,
                        contact_number
                    FROM core_partner_details
                    JOIN core_partner_type_details 
                        ON core_partner_details.partner_type = core_partner_type_details.type_id
                    WHERE core_partner_details.business_id = ?
                    AND core_partner_details.partner_type = ?
                    LIMIT ? OFFSET ?`,
                    [business_id, partner_type,count,(page_number - 1) * count]
                );
                if (rows.length > 0) {
                    logger.info("Got dealer details successfully");
                    console.log("Got dealer details successfully");
                    return res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Got product list successfully",
                        params: rows
                    });
                } else {
                    logger.error("No dealers found");
                    console.error("No dealers found");
                    return res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "SC000" },
                        message: "No product list found",
                        params: []
                    });
                }
            }
        else{
            //filter condition
            if(partner_name != "" && partner_type != ""){
                //product filtee
                const [rows] = await connection.query(
                    `SELECT  
                        partner_name,
                        core_partner_type_details.type_name AS partner_type,
                        contact_person,
                        contact_number
                    FROM core_partner_details
                    JOIN core_partner_type_details 
                        ON core_partner_details.partner_type = core_partner_type_details.type_id
                    WHERE core_partner_details.business_id = ?
                    AND partner_name = ?
                    AND core_partner_details.partner_type = ?
                    LIMIT ? OFFSET ?;`,
                    [business_id,partner_name, partner_type,count,(page_number - 1) * count]
                );
                if (rows.length > 0) {
                    logger.info("Got dealer details successfully");
                    console.log("Got dealer details successfully");
                    return res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Got product list successfully",
                        params: rows
                    });
                } else {
                    logger.error("No dealers found");
                    console.error("No dealers found");
                    return res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "SC000" },
                        message: "No product list found",
                        params: []
                    });
                }
            }
            
        }
    }
    catch(err){
    logger.error(`Error processing request: ${err.message}`);
    console.error(`Error processing request: ${err.message}`);
    res.status(500).json({
        statusDesc: "Failure",
        statusCode: { code: "F005" },
        message: err.message,
    });
    }finally{
    if (connection) connection.release();
    }
}

//view partner
exports.viewpartner = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
            partner_name: Joi.string().required(),
            business_id: Joi.string().required(),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { partner_name, business_id } = req.query;

        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        const [rows] = await connection.query(
            `SELECT  
                        partner_name,
                        partner_type,
                        contact_person,
                        address,
                        description,
                        email,
                        gstin,
                        contact_number
                    FROM core_partner_details
                    WHERE business_id = ?
                    AND partner_name = ?;`,
               [business_id,partner_name]
        );

        if (rows.length > 0) {
            return res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got partner details successfully",
                params: rows,
            });
        } else {
            return res.status(200).json({
                statusDesc: "Failure",
                statusCode: { code: "F0015" },
                message: "No partner found",
            });
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};

//experience customer name in invocie and credit note
exports.experiencepartner = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, partner_name } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && partner_name && business_id !== "" && partner_name !== "") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            // Query to get customer details from party_details table
            const [rows] = await connection.query('SELECT partner_name,address,contact_number FROM `core_partner_details` WHERE partner_name LIKE ? AND business_id = ?', [`%${partner_name}%`, business_id]);

            if (rows.length >= 1) {
                // If customer found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get partner details successfully",
                    param: rows
                });
                logger.info("Customer details retrieved successfully");
                console.log("Customer details retrieved successfully");
            } else {
                // If no matching customer found
                logger.error("No partner available");
                console.error("No partner available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No party available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//update partner
exports.updatepartner = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
                partner_name: Joi.string().required(),
                business_id: Joi.string().required(),
                partner_type: Joi.string().required(),
                email: Joi.string().allow('').email().optional(),
                address: Joi.string().allow('').required(),
                description: Joi.string().allow('').required(),
                gstin: Joi.string().allow('').required(),
                contact_person: Joi.string().required(),
                contact_number: Joi.string().required()
        });

        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { partner_name, partner_type, email,address,description,gstin,contact_person,contact_number, business_id } = req.body;

        const lengthRegex = /^\d{10}$/;
            if (lengthRegex.test(contact_number)) {
                
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            const [updateResult] = await connection.query(
                'UPDATE core_partner_details SET partner_type = ?,email=?,address=?,description=?,gstin=?,contact_person=?,contact_number=? WHERE partner_name = ?  AND business_id = ?',
                [partner_type, email,address,description,gstin,contact_person,contact_number, partner_name, business_id]
            );

            if (updateResult.affectedRows > 0) {
                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "partner updated."
                });
            } else {
                res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "No partner."
                });
            }
        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }
    } catch (err) {
        logger.error(`Error in updatepartnerstatus: ${err.message}`);
        console.error(`Error in updatepartnerstatus: ${err.message}`);
        res.status(422).json({
              statusDesc: "Failure",
              statusCode: err.code || 'F005',
              message: err.message,
          });
      } finally {
          if (connection) connection.release(); // Ensure the connection is released back to the pool
      }
};

//chnageing case status
exports.changeCaseStatusV1 = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
            case_id: Joi.string().required(),
            action: Joi.string().required(),
            business_id: Joi.string().required()
        });

        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { case_id, action, business_id } = req.body;

        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        //ACTION : AC_CREATE_TRANSFER -> HOLD
        //ACTION :AC_CLOSE_TRASNFER -> CREATED

        //checking the case id is exited or not 
        const [existingCase] = await connection.query(
            'SELECT * FROM `case_registry` WHERE case_id = ? AND business_id = ?',
            [case_id, business_id]
        );

        if (existingCase.length === 0) {

            throw new AppError(`Case ID ${case_id} does not exist in CORE`, 'F001');

        }

        //checking the case id is VALID SATE
        const [caseWorkFlow] = await connection.query(
            'SELECT * FROM `work_flow_management` WHERE case_id = ? AND business_id = ?',
            [case_id, business_id]
        );

        if (caseWorkFlow.length === 0) {

            throw new AppError(`No matching entity found`, 'F002');

        }else{

            if(caseWorkFlow[0].status != "READY" && caseWorkFlow[0].status != "DELIVERED" ){

                //case locking condition satisfied

                if(action == "AC_CREATE_TRANSFER"){
                    if(caseWorkFlow[0].status === "HOLD"){
                        throw new AppError(`No matching entity found`, 'F010');
                    }
                    else{
                        //HOLD Satate
                        const [result] = await connection.query(
                        'UPDATE work_flow_management SET status = ? WHERE case_id = ? AND business_id = ?',
                        ["HOLD", case_id, business_id]
                        );

                        // If no rows were updated, throw an error
                        if (result.affectedRows === 0) {

                            throw new AppError(`No matching entity found`, 'F002');

                        }   
                    }



                }else if(action == "AC_CLOSE_TRASNFER"){

                    //HOLD Satate
                    const [result] = await connection.query(
                        'UPDATE work_flow_management SET status = ? WHERE case_id = ? AND business_id = ?',
                        ["CREATED", case_id, business_id]
                    );
                    
                    // If no rows were updated, throw an error
                    if (result.affectedRows === 0) {

                        throw new AppError(`No matching entity found`, 'F002');

                    }  

                }else{

                    throw new AppError(`No matching entity found`, 'F002');

                }

                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Action Completed",
                });

            }else{

                throw new AppError(`Action not completed`, 'F003');

            }
        }

    } catch (err) {

        logger.error(`Error in updateSerialStatus: ${err.message}`);
        console.error(`Error in updateSerialStatus: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

//get case summary
exports.getCaseSummary = async (req, res) => {
    let connection;
    try {

        //input validation
        const schema = Joi.object({
            business_id: Joi.string().required()
        });

        //getting connetion
        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const {business_id} = req.query

        //waraty check
        const [cacheFlag] = await connection.query(
            'SELECT cache_flag FROM `core_job_sheet_summary_details` WHERE  business_id = ?',
            [business_id]
        );

        if (cacheFlag[0].cache_flag == 1) {
           //take data from summary table
           const [summaryDetails] = await connection.query(
                'SELECT tota_job_count,total_received,total_balance FROM `core_job_sheet_summary_details` WHERE  business_id = ?',
                [business_id]
           );

            // Ensure at least one row is returned before accessing the value
            if (!summaryDetails.length || summaryDetails[0].tota_job_count === null || summaryDetails[0].total_received === null || summaryDetails[0].total_balance === null) {
                throw new Error('No details available'); 
            }

            //res
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Details fethced successfully",
                params: summaryDetails
            });

        }else if(cacheFlag[0].cache_flag == 0){
            //no cache action
            const [summaryDetails] = await connection.query(
                'SELECT SUM(CAST(case_registry.total_bill AS DECIMAL(10,2))) AS total_received, SUM(CAST(case_registry.balance AS DECIMAL(10,2))) AS total_balance, COUNT(DISTINCT case_registry.case_id) AS tota_job_count FROM case_registry INNER JOIN work_flow_management ON case_registry.case_id = work_flow_management.case_id WHERE case_registry.business_id = ? AND work_flow_management.business_id = ?',
                [business_id,business_id]
            );

            // const totalsAndCounts = {
            //     totalBill: summaryDetails[0]?.totalBill || 0,
            //     totalAdvance: summaryDetails[0]?.totalAdvance || 0,
            //     totalBalance: summaryDetails[0]?.totalBalance || 0,
            //     totalCases: summaryDetails[0]?.totalCases || 0,
            // };

            console.log(summaryDetails)
            // Ensure at least one row is returned before accessing the value
            if (!summaryDetails.length || summaryDetails[0].total_received === null || summaryDetails[0].total_balance === null || summaryDetails[0].tota_job_count === 0) {
                throw new Error('No details available'); 
            }

            //updating cache table
            const [result] = await connection.query(
                'UPDATE `core_job_sheet_summary_details` SET tota_job_count	 = ? , total_received = ? , total_balance = ? , cache_flag = ? WHERE  business_id = ?;',
                [summaryDetails[0].tota_job_count,summaryDetails[0].total_received,summaryDetails[0].total_balance,1,business_id]
            );

            //affectedRows > 0
            if(result.affectedRows > 0){
                //res
                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Details fethced successfully",
                    params: summaryDetails
                });
            }else{
                throw new AppError('Failed to update summary tabel','F002');
            }

        }else{
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "Action not completed"
            });
        }
    }catch(err){
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    }finally{
        if (connection) connection.release();
    }
}

//experience courier name in create order delivery
exports.experiencecourier = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, courier_name } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience courier partner details and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience courier partner details and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && courier_name && business_id !== "" && courier_name !== "") {

            // Establish database connection
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            // Query to get courier partner details from party_details table
            const [rows] = await connection.query(
            `SELECT p.partner_name 
            FROM core_partner_details p 
            JOIN core_partner_type_details t 
                ON p.partner_type = t.type_id 
            WHERE t.type_name = 'COURIER PARTNER' 
                AND p.partner_name LIKE ? 
                AND p.business_id = ?`,
            [`%${courier_name}%`, business_id]
            );

            if (rows.length >= 1) {
                // If courier partner found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get courier partner details successfully",
                    param: rows
                });
                logger.info("Courier partner details retrieved successfully");
                console.log("Courier partner details retrieved successfully");
            } else {
                // If no matching courier partner found
                logger.error("No partner available");
                console.error("No partner available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No courier partner available"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//experience courier name in delivery order filter
exports.experiencecourierpartner = async (req, res) => {
    let connection;
    try {
        logger.info("Delivery order courier partner experience initiated.");
        console.log("Delivery order courier partner experience initiated.");
        
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, courier_name } = body;

        logger.info(body);
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience customer details and request packet:`);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id && courier_name && business_id !== "" && courier_name !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Establish database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Fetching delivery order courier partner");
            console.log("Fetching delivery order courier partnter");

            // Query to get delivery order from core_delivery_order_details table
            logger.info(`query:SELECT courier_patner_name FROM core_delivery_order_details WHERE courier_patner_name LIKE ? AND business_id = ?`);
            logger.info(`parameters:${JSON.stringify({courier_name, business_id})}`);
            const [rows] = await connection.query('SELECT courier_patner_name FROM `core_delivery_order_details` WHERE courier_patner_name LIKE ? AND business_id = ?', [`%${courier_name}%`, business_id]);

            if (rows.length >= 1) {
                // If customer found, return the details
                logger.info(`response send: statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got delivery order courier partner names successfully",
                params:${JSON.stringify(rows)}`);
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Got delivery order courier partner names successfully",
                    param: rows
                });
                logger.info("Delivery order courier partner names retrieved successfully");
                console.log("Delivery order courier partner names retrieved successfully");
            } else {
                // If no matching delivery order ID found
                logger.error("No matching delivery order courier partner names available");
                console.error("No matching delivery order courier partner names available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No matching delivery order courier partner names available"
                });
            }

        } else {
            logger.error('No valid delivery order courier partner name found');
            console.error('No valid delivery order courier partner name found');
            const error = new Error('Enter valid delivery order courier partner name');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

exports.sendJobReminder = async (req, res) => {
    let connection;
    //constructing schema
    try {
        const schema = Joi.object({
        balance: Joi.number().required(),
        case_id: Joi.number().required(),
        business_id: Joi.string().trim().required(),
        });

        logger.info("Joi schema defined successfully");
        console.log("Joi schema defined successfully");

        //getting connetion
        logger.info("Attempting to get MySQL connection.");
        console.log("Attempting to get MySQL connection.");
        connection = await pool.promise().getConnection();
        
        //schema validation
        logger.info("Running schema validation on request body.");
        console.log("Running schema validation on request body.");
        const { error } = schema.validate(req.body)
        if (error){ 
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        const {
        case_id,
        balance,
        business_id,
        } = req.body;

        //Updating pos_expense_details table
        logger.info(`Fetching customer details with query:
        SELECT customer_name, phoe_number, date FROM case_registry
        WHERE case_id = ? AND business_id = ?
        With values: [${case_id}, ${business_id}]`);

        console.log("Fetching customer details.");
        const [rows] = await connection.execute(
            `SELECT customer_name, phoe_number, date FROM case_registry 
            WHERE case_id = ? AND business_id = ?`,
            [case_id, business_id]
        );
        const [shopname] = await connection.query(
                'SELECT  compnay_name from relam_master WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE business_id = ? LIMIT 1)',
                [business_id]
            );

        logger.info("Committing transaction.");
        console.log("Committing transaction.");
        await connection.commit();
        const re_id = `REQ${Date.now()}`;

        const nmsPayload={
            re_id: re_id,
            destination_phone_number:String(rows[0].phoe_number),
            customer_name: rows[0].customer_name,
            template_id: "1017",
            message_type: "text",
            media_url: "/Data",
            business_id:business_id,
            isBypass:"0",
            params: [
                {
                    type: "text",
                    text: rows[0].customer_name
                },
                {
                    type: "text",
                    text: shopname[0].compnay_name
                },
                {
                    type: "text",
                    text: balance
                },
                {
                    type: "text",
                    text: case_id
                },
                {
                    type: "text",
                    text: rows[0].date
                },
                {
                    type: "text",
                    text: balance
                },
                {
                    type: "text",
                    text: shopname[0].compnay_name
                }
            ]
        }

        logger.info("Prepared NMS Payload:", JSON.stringify(nmsPayload));
        //calling meta for sending notification
        logger.info(`NMS URL for sending meta notification is  ${NMS_URL}/nms/api/v1/sendMetaNotifications`)
        logger.info(`req body is : ${nmsPayload}`)
        // const nmsResponse = await axios.post(`${NMS_URL}/nms/api/v1/sendMetaNotifications`,nmsPayload);
        const nmsResponse = await axios.post(`${NMS_URL}/nms/api/v2/sendMetaNotifications`,nmsPayload);

        logger.info("Meta notification sent. Response: " + JSON.stringify(nmsResponse.data));

        return res.status(200).json(nmsResponse.data);

    }catch(err){

        if (connection) {
            await connection.rollback();
        }

        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        //sending failure response
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    }finally{
        logger.info("Releasing MySQL connection.");
        console.log("Releasing MySQL connection.");
        if (connection) connection.release();
    }
}
exports.exportBusinessPartnerExcel = async (req, res) => {
    let connection;
    try {
        const { partnerName, partnerType, business_id } = req.query;

        if (!business_id) {
            return res.status(400).json({ message: "Missing business_id" });
        }

        connection = await pool.promise().getConnection();

        let queryConditionString = "1=1";
        const queryParams = [];

        if (partnerName) {
            queryConditionString += " AND core_partner_details.partner_name LIKE ?";
            queryParams.push(`%${partnerName}%`);
        }
        if (partnerType) {
            queryConditionString += " AND core_partner_details.partner_type = ?";
            queryParams.push(partnerType);
        }

        const exportQuery = `
            SELECT  
                core_partner_details.partner_name,
                core_partner_type_details.type_name AS partner_type,
                core_partner_details.contact_person,
                core_partner_details.contact_number
            FROM core_partner_details
            JOIN core_partner_type_details 
                ON core_partner_details.partner_type = core_partner_type_details.type_id
            WHERE ${queryConditionString} AND core_partner_details.business_id = ?
            ORDER BY core_partner_details.partner_name ASC;
        `;

        queryParams.push(business_id);

        const [rows] = await connection.query(exportQuery, queryParams);

        // Excel generation
        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Business Partners");

        worksheet.columns = [
            { header: "SL", key: "sl", width: 5 },
            { header: "Partner Name", key: "partner_name", width: 25 },
            { header: "Partner Type", key: "partner_type", width: 20 },
            { header: "Contact Person", key: "contact_person", width: 25 },
            { header: "Contact Number", key: "contact_number", width: 15 }
        ];

        rows.forEach((row, index) => {
            worksheet.addRow({
                sl: index + 1,
                ...row
            });
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=business_partners.xlsx");

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Error exporting Business Partners:", error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        if (connection) connection.release();
    }
};


//Experience issue

exports.experianceissue = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, issue } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience get item and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience get item and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && issue && business_id !== "" && issue !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get item details from item_information table
            const [rows] = await connection.query('SELECT issue FROM `issue_details` WHERE issue LIKE ?', [`%${issue}%`]);

            if (rows.length >= 1) {
                // If item found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get issue details successfully",
                    param: rows
                });
                logger.info("issue details retrieved successfully");
                console.log("Issue details retrieved successfully");
            } else {
                // If no matching item found
                logger.error("No issue available");
                console.error("No issue available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No issue found"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};


//Experience Support
exports.experiancesupport = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, support } = body;
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience get item and request packet:`);
        console.log(`Request reached from host ${clientIp} for experience get item and request packet:`);
        logger.info(body);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (business_id && support && business_id !== "" && support !== "") {

            // Establish database connection
            logger.info("Requesting database connection from pool.");
            console.log("Requesting database connection from pool.");
            connection = await pool.promise().getConnection();
            logger.info("Database connection established successfully.");
            console.log("Database connection established successfully.");
            // Query to get item details from item_information table
            const [rows] = await connection.query('SELECT equipment FROM `support_equpment_details` WHERE equipment LIKE ?', [`%${support}%`]);

            if (rows.length >= 1) {
                // If item found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Get equipment details successfully",
                    param: rows
                });
                logger.info("Equipment details retrieved successfully");
                console.log("Equipment details retrieved successfully");
            } else {
                // If no matching item found
                logger.error("No Equipment available");
                console.error("No Equipment available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No Equipment found"
                });
            }

        } else {
            logger.error('Primary validation error: Some mandatory fields need to be filled');
            console.error('Primary validation error: Some mandatory fields need to be filled');
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//core pos intrgration
const toFixed2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Fetch next invoice number
async function getNextInvoiceNumber(businessId) {
  const url = `${POS_URL}/posV1GetInvoiceSequence?business_id=${encodeURIComponent(businessId)}`;
  logger.info(`getNextInvoiceNumber called. businessId=${businessId}`);
  const { data } = await axios.get(url, { timeout: 10000 });
  logger.info(`POS Response (Invoice Sequence): ${JSON.stringify(data)}`);
  if (!data?.statusCode?.code || data.statusCode.code !== 'SC000') {
    throw new Error(data?.message || 'Unable to fetch invoice sequence');
  }
  const seq = Number(data.params?.[0]?.sequence_value);
  if (!Number.isFinite(seq)) throw new Error('Invalid sequence value from POS');
  return seq + 1;
}

// Fetch prefix 
async function getDocumentPrefix(businessId) {
  const url = `${POS_URL}/posV1GetDocumentPrefix?business_id=${encodeURIComponent(businessId)}`;
  logger.info(`getDocumentPrefix called. businessId=${businessId}`);
  const { data } = await axios.get(url, { timeout: 10000 });
  logger.info(`POS Response (Document Prefix): ${JSON.stringify(data)}`);
  if (!data?.statusCode?.code || data.statusCode.code !== 'SC000') {
    throw new Error(data?.message || 'Unable to fetch document prefix');
  }
  const prefix = data.params?.prefix;
  const financial_year = data.params?.financial_year;
  if (!prefix || !financial_year) throw new Error('Prefix or financial year missing from POS');
  return { prefix, financial_year };
}

// Fetch IMS details for a single serial
async function getAssetDetailsBySerial({ serial_number, product_name, business_id }) {
  const url = `${IMS_URL}/imsV1GetAssestsDetailsFromSerial` +
    `?serialNumber=${encodeURIComponent(serial_number)}` +
    `&product_name=${encodeURIComponent(product_name)}` +
    `&business_id=${encodeURIComponent(business_id)}`;
  logger.info(`getAssetDetailsBySerial called. serial=${serial_number}, product=${product_name}, business=${business_id}`);
  const { data } = await axios.get(url, { timeout: 10000 });
  logger.info(`IMS Response (Asset Details): ${JSON.stringify(data)}`);
  if (!data?.statusCode?.code || data.statusCode.code !== 'SC000' || !Array.isArray(data.params) || !data.params.length) {
    throw new Error(data?.message || `IMS: No asset for serial ${serial_number}`);
  }
  const a = data.params[0];
  return {
    sku_number: String(a.sku_number),
    batch: String(a.batch ?? '0'),
    product_name: a.product_Name,
    product_type: a.product_type,           
    product_id: a.product_id,          
    hsn_code: a.hsn_code,
    discount_flag: a.discount_flag ?? 2,
    discount_percent: Number(a.discount ?? 0),
    unit_price: Number(a.unit_price ?? 0),
    igst_rate: Number(a.igst ?? 0),      
    cess_percentage: Number(a.cess_percentage ?? 0),
    cess_amount: Number(a.cess_amount ?? 0),
    selling_price: Number(a.selling_price ?? 0),
    serial_number: a.serial_number
  };
}

function buildPosItemsFromAssets(allAssets, taxMode /* 'intra' | 'inter' */) {
  logger.info(`buildPosItemsFromAssets called with ${allAssets.length} assets, taxMode=${taxMode}`);
  const map = new Map();

  for (const asset of allAssets) {
    const key = [
      asset.sku_number,
      asset.product_name,
      asset.product_id,
      asset.hsn_code,
      asset.batch
    ].join('|');

    if (!map.has(key)) {
      map.set(key, {
        sku_id: asset.sku_number,
        product_name: asset.product_name,
        product_catagory: String(asset.product_type ?? '1'),
        batch_value: String(asset.batch ?? '0'),
        hsn_code: asset.hsn_code,
        product_id: String(asset.product_id),
        unit_price: asset.unit_price,
        selling_price: asset.selling_price,            
        discount_flag: asset.discount_flag ?? 2,  
        discount_percent: asset.discount_percent ?? 0,
        igst_rate: asset.igst_rate ?? 0,
        cgst_rate: taxMode === 'intra' ? (asset.igst_rate ?? 0) / 2 : 0,
        sgst_rate: taxMode === 'intra' ? (asset.igst_rate ?? 0) / 2 : 0,
        cess_percentage: asset.cess_percentage ?? 0,
        serial_numbers: [],
      });
    }

    const group = map.get(key);
    group.serial_numbers.push(asset.serial_number);
  }
  logger.info(`Grouped assets into ${map.size} product groups`);
  // compute per-group amounts
  let sl_no = 1;
  const posItems = [];

  for (const [, group] of map.entries()) {

    const quantity = group.serial_numbers.length;
    const unitPrice = Number(group.selling_price) || 0;
    const base = unitPrice * quantity;

    const flag = Number(group.discount_flag);
    const pct = Number(group.discount_percent) || 0;          
    const flatInput = group.discount_amount ?? group.discount_percent;
    const flatPerUnit = Number(flatInput) || 0;   

    let discountPerUnit = 0;
    let discountTotal = 0;

    if (flag === 1) {

      // no discount
      discountPerUnit = 0;
      discountTotal = 0;

    } else if (flag === 2) {

      // percentage
      discountPerUnit = unitPrice * (pct / 100);
      discountTotal = discountPerUnit * quantity;

    } else if (flag === 3) {

      // flat 
      discountPerUnit = flatPerUnit;
      discountTotal = discountPerUnit * quantity;

    } else {

      discountPerUnit = 0;
      discountTotal = 0;

    }

    const discountAmount = toFixed2(discountTotal);
    const taxable_amount = toFixed2(base - discountTotal);

    const igst_rate = group.igst_rate
    const cgst_rate = group.cgst_rate
    const sgst_rate = group.sgst_rate

    const igst_amount = toFixed2(taxable_amount * igst_rate);
    const cgst_amount = toFixed2(taxable_amount * cgst_rate);
    const sgst_amount = toFixed2(taxable_amount * sgst_rate);

    const cess_rate = Number(group.cess_percentage) || 0;
    const cess_amoumt = toFixed2(taxable_amount * cess_rate);

    const total_amount = toFixed2(taxable_amount + igst_amount);

    const item = {
      sl_no: sl_no++,
      sku_id: String(group.sku_id),
      product_catagory: String(group.product_catagory),
      batch_value: String(group.batch_value ?? '0'),
      product_name: group.product_name,
      hsn_code: String(group.hsn_code),
      product_id: String(group.product_id),
      quantity,
      serial_numbers: group.serial_numbers,
      unit_price: toFixed2(group.selling_price),
      discount: Number(group.discount_percent),
      dicount_flag: Number(group.discount_flag),
      igst_rate: igst_rate,
      igst_amount,
      cgst_rate,
      cgst_amount,
      sgst_rate,
      sgst_amount,
      cess_amoumt:  igst_amount,
      taxable_amount,
      total_amount,
    };

    logger.info(`POS Item built: ${JSON.stringify(item)}`);
    posItems.push(item);
  }
  logger.info(`buildPosItemsFromAssets returning ${posItems.length} items`);
  return posItems;
}

exports.generateBill = async (req, res) => {
  let connection;
  try {
    logger.info(`Request body = ${JSON.stringify(req.body)}`);
    logger.info("Joi schema defining for creating invoice");
    const schema = Joi.object({
      customer_name: Joi.string().trim().min(1).required(),
      customer_phone_number: Joi.string().pattern(/^[0-9]{10}$/).required(),
      billing_address: Joi.string().trim().required(),
      invoice_date: Joi.date().iso().required(),
      state_code: Joi.string().trim().max(10).required(),
      state_name: Joi.string().trim().required(),
      default_state_name: Joi.string().trim().required(),
      additional_charges: Joi.number().min(0).default(0),
      additional_tag_name: Joi.string().trim().allow("").optional(),
      sub_total: Joi.number().min(0).required(),
      round_off: Joi.number().default(0),
      grand_total: Joi.number().min(0).required(),
      received_amount: Joi.number().required(),
      balance: Joi.number().required(),
      cse_id: Joi.number().required(),
      created_by:Joi.string().trim().required(),
      business_id: Joi.string().trim().required(),
      items: Joi.array().items(
        Joi.object({
          sku_id: Joi.string().trim().required(),
          product_name: Joi.string().trim().required(),
          serial_number: Joi.string().trim().required(),
        })
      ).min(1).required(),
    });

    const { error } = schema.validate(req.body);
    if (error) {
      logger.error(`Validation Error: ${error.details[0].message}`);
      return res.status(400).json({
        statusDesc: "Failure",
        statusCode: { code: "F005" },
        message: `Validation Error: ${error.details[0].message}`,
      });
    }

    const {
      customer_name,
      customer_phone_number,
      billing_address,
      invoice_date,
      state_code,
      state_name,
      default_state_name,
      additional_charges = 0,
      additional_tag_name,
      round_off = 0,
      sub_total,
      grand_total,
      received_amount,
      balance,
      cse_id,
      business_id,
      created_by,
      items
    } = req.body;

    logger.info(`Request validated. Business: ${business_id}, CSE: ${cse_id}, Items: ${items.length}`);

    connection = await pool.promise().getConnection();
    logger.info("DB connection acquired");
    
    //user activity check
    const GET_USER_ACTIVITY_POLICY = `${BASE_URL}/v1/api/getUserActivityPolicy`
    async function fetchUserPolicy() {
        try {
            logger.info(`Fetching user policy from API: ${GET_USER_ACTIVITY_POLICY} for business_id: ${business_id}`);
            console.log(`Fetching user policye from API: ${GET_USER_ACTIVITY_POLICY} for business_id: ${business_id}`);

            const response = await axios.get(`${GET_USER_ACTIVITY_POLICY}?event=CORE_SALE&business_id=${business_id}`);

            if (response.data?.statusCode?.code === "SC000") {

                logger.info(`Successfully fetched user policy: ${JSON.stringify(response.data.param)}`);
                console.log(`Successfully fetched user policy: ${JSON.stringify(response.data.param)}`);
                return response.data.param;
            } else {
                logger.error(`Error in API response: ${JSON.stringify(response.data)}`);
                console.error(`Error in API response: ${JSON.stringify(response.data)}`);
                throw new Error(response.data.message || "Invalid response from user policye");
            }
            } catch (error) {
                logger.error(`Error fetching user policy: ${error.message}`);
                console.error(`Error fetching user policy: ${error.message}`);
                throw new Error(error.response?.data?.message || "Failed to fetch user policy");
            }
    }
        const userPolicy = await fetchUserPolicy();

        if(userPolicy.isCheck == 1){
            //couting cases
            const [thisMonthCaseCount] = await connection.query(
                "SELECT count(*) AS current_count FROM `case_registry` WHERE business_id = ? AND bill_status = 1 AND `date` BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE());",
                [business_id]
            );

            if(thisMonthCaseCount[0].current_count >= userPolicy.limit){
                //Blocking the user from the action
                logger.error(`User exceed the free limit`);
                console.error(`User exceed the free limit`);
                throw new Error("You’ve reached your free quota for this month. Upgrade to a premium plan to keep enjoying uninterrupted access");
            }
        }
        //Use policy action completed
    // 1) Build invoice_number, prefix/year and invoice_id
    logger.info("Generating invoice number & invoice id");
    const [invoiceNumber, { prefix, financial_year }] = await Promise.all([
      getNextInvoiceNumber(business_id),
      getDocumentPrefix(business_id),
    ]);

    const invoice_id = `${prefix}/INV-${invoiceNumber}/${financial_year}`;
    logger.info(`Generated invoice_id: ${invoice_id}, invoice_number: ${invoiceNumber}`);
    
    // 2) Fetch IMS details for each serial
    logger.info("Fetching IMS asset details for serial numbers");
    const assets = await Promise.all(items.map(async (it) => {
      logger.info(`Outbound IMS Request for serial = ${it.serial_number}, product = ${it.product_name}, business = ${business_id}`);
      const resp = await getAssetDetailsBySerial({
        serial_number: it.serial_number,
        product_name: it.product_name,
        business_id
      });
      logger.info(`IMS Response for serial ${it.serial_number}: ${JSON.stringify(resp)}`);
      return resp;
    }));
    logger.info(`IMS details fetched for ${assets.length} items`);
    logger.info(`Product Details Got from IMS as ${assets}`);

    // 3) Decide tax mode
    const taxMode = (String(state_name).trim().toLowerCase() === String(default_state_name).trim().toLowerCase())
      ? 'intra' : 'inter';
    logger.info(`Tax mode determined: ${taxMode}`);
    // 4) Group + compute POS item lines
    const posItems = buildPosItemsFromAssets(assets, taxMode);
    logger.info(`POS items constructed. Count: ${posItems.length}`);

    // 6) Call POS to create order
    const payload = {
      customer_name,
      customer_phone_number,
      invoice_type: 2, // always GST
      billing_address,
      eway_bill: "",
      invoice_date,     
      state_code,
      state_name,
      default_state_name,
      additional_charges: Number(additional_charges),
      additional_tag_name:additional_tag_name || "Addiotional Charges",
      sub_total: Number(sub_total),
      round_off: Number(round_off),
      grand_total: Number(grand_total),
      payment_id: "1",          
      transaction_id: "0",      
      received_amount: Number(received_amount),
      balance: Number(balance),
      invoice_id,
      created_by,
      business_id,
      invoice_number: String(invoiceNumber),
      items: posItems
    };

    logger.info(`POS request payload=${JSON.stringify(payload)}`);

    const { data: posResp } = await axios.post(
    `${POS_URL}/posV3CreateOrder`,
    payload,
    {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
    }
    );
    logger.info(`POS response received: ${JSON.stringify(posResp)}`);
    // validate POS response
    const isSuccess =
    posResp?.statusCode?.code === 'SC000' || posResp?.statusDesc === 'Success';
    const documentId = posResp?.data?.document_id;
    if (!isSuccess || !documentId) {
        logger.error(`POS order creation failed. Response: ${JSON.stringify(posResp)}`);
        throw new Error(
            `POS order creation failed or missing document_id. Resp: ${JSON.stringify(posResp)}`
        );
    }

    // update case_registryd.
    const sql = `UPDATE case_registry SET bill_status = 1, auto_bill_flag = 1, document_no = ?, invoice_id = ? WHERE case_id = ? AND business_id = ?`;
    const sqlParams = [String(documentId), String(invoice_id), cse_id, business_id];
    logger.info(`Executing SQL: ${sql} | Params=${JSON.stringify(sqlParams)}`);
    await connection.query(sql, sqlParams);
    logger.info(`case_registry updated. Case: ${cse_id}, Document: ${documentId}`);
    // bubble the response
    const finalResp = {
      statusDesc: 'Success',
      statusCode: { code: 'SC000' },
      message: 'GST Invoice created',
      params: {
        invoice_id,
        invoice_number: String(invoiceNumber),
        pos_response: posResp
      }
    };
    logger.info(`Outbound Response to client: ${JSON.stringify(finalResp)}`);

    return res.status(200).json(finalResp);

  } catch (err) {

    logger.error(`Error processing request: ${err.message}`);
    return res.status(500).json({
      statusDesc: "Failure",
      statusCode: { code: "F005" },
      message: "Sorry, we’re unable to process your request at the moment",
    });
  } finally {

    if (connection) connection.release();
    logger.info("DB connection released");
  }
};

exports.getBillStatus = async (req, res) => {
  const { case_id, business_id } = req.query; 

  logger.info(`Request query = ${JSON.stringify(req.query)}`);
  if (!case_id || !business_id) {
    logger.warn(`Missing required params. case_id=${case_id}, business_id=${business_id}`);
    const resp = {
      success: false,
      message: "case_id and business_id are required"
    };
    logger.info(`Response to client: 400 | ${JSON.stringify(resp)}`);
    return res.status(400).json(resp);
  }

  let connection;
  try {
    logger.info(`Checking bill status for Case: ${case_id}, Business: ${business_id}`);
    connection = await pool.promise().getConnection();
    logger.info("DB connection acquired");

    const sql = "SELECT bill_status, document_no, invoice_id FROM case_registry WHERE case_id = ? AND business_id = ?";
    const params = [case_id, business_id];
    logger.info(`Executing SQL: ${sql} | Params=${JSON.stringify(params)}`);

    const [rows] = await connection.query(sql, params);

    if (rows.length === 0) {
      logger.warn(`Case not found. Case: ${case_id}, Business: ${business_id}`);  
      const resp = {
        success: false,
        message: "Case not found",
        case_id,
        business_id
      };
      logger.info(`Response to client: 404 | ${JSON.stringify(resp)}`);
      return res.status(404).json(resp);
    }

    const resp = {
      success: true,
      case_id,
      business_id,
      bill_status: rows[0].bill_status,
      documentId: rows[0].document_no,
      invoiceId: rows[0].invoice_id
    };
    logger.info(`Response to client: 200 | ${JSON.stringify(resp)}`);
    return res.json(resp);

  } catch (err) {
    logger.error(`Error fetching bill status: ${err.message}`, { case_id, business_id, stack: err.stack });
    const resp = {
      success: false,
      message: "Internal server error",
      case_id,
      business_id
    };
    logger.info(`Response to client: 500 | ${JSON.stringify(resp)}`);
    return res.status(500).json(resp);
  } finally {
    if (connection) connection.release();
    logger.info("DB connection released");
  }
};

exports.exportWorkflow = async (req, res) => {
    let connection;
    try {
        const clientIp = req.socket.remoteAddress;
        const body = req.query;
        const { business_id, employee_name } = body;

        logger.info(`Request from ${clientIp} for workflow data:`, body);

        if (!business_id || business_id === "") {
            logger.error("Primary validation failed: missing business_id");
            return res.status(400).json({
                statusDesc: "Failure",
                statusCode: { code: "F001" },
                message: "business_id is required",
            });
        }

        connection = await pool.promise().getConnection();

        let query = `
            SELECT assigne, 
                   COUNT(*) AS total_cases_assigned, 
                   SUM(CASE WHEN wfm.status = 'INPROGRESS' THEN 1 ELSE 0 END) AS total_new_cases, 
                   SUM(CASE WHEN wfm.status = 'READY' THEN 1 ELSE 0 END) AS total_completed_cases, 
                   SUM(CASE WHEN wfm.status = 'RETURN' THEN 1 ELSE 0 END) AS total_inprogress_cases, 
                   SUM(CASE WHEN wfm.status = 'REPEATE' THEN 1 ELSE 0 END) AS total_blocked_cases, 
                   mu.role_index
            FROM work_flow_management wfm 
            JOIN \`master-users\` mu ON wfm.assigne = mu.userName
            WHERE wfm.business_id = ? 
        `;
        const params = [business_id];

        if (employee_name) {
            query += " AND wfm.assigne LIKE ? ";
            params.push("%" + employee_name + "%");
        }

        query += ` GROUP BY wfm.assigne 
                   ORDER BY wfm.date DESC;`

        const [rows] = await connection.query(query, params);

        // Role mapping
        rows.forEach(r => {
            switch (r.role_index) {
                case 0: r.role_index = "ADMINISTRATOR"; break;
                case 1: r.role_index = "ENGINEER"; break;
                case 2: r.role_index = "FRONT OFFICER"; break;
                case 3: r.role_index = "SALES HEAD"; break;
                case 4: r.role_index = "SALES PERSON"; break;
                case 5: r.role_index = "INVENTORY MASTER"; break;
            }
        });

        // Excel Generation
        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("WorkFlow Data");

        worksheet.columns = [
            { header: "SL", key: "sl", width: 5 },
            { header: "Assignee", key: "assigne", width: 25 },
            { header: "Role", key: "role_index", width: 20 },
            { header: "Total Cases Assigned", key: "total_cases_assigned", width: 20 },
            { header: "New Cases", key: "total_new_cases", width: 15 },
            { header: "Completed Cases", key: "total_completed_cases", width: 20 },
            { header: "In Progress Cases", key: "total_inprogress_cases", width: 20 },
            { header: "Blocked Cases", key: "total_blocked_cases", width: 20 },
        ];

        rows.forEach((row, index) => {
            worksheet.addRow({
                sl: index + 1,
                ...row
            });
        });

        // Send Excel file as response
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            "attachment; filename=workflow_export.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        logger.error("Error exporting workflow data:", err);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: err.code || "F005" },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};

exports.exportWorkFlowHistory = async (req, res) => {
    let connection;
    try {
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, workerName, case_id, fromDate, endDate, filterFlag, jobStatus } = body;

        logger.info(`Request reached from host ${clientIp} for work-flow-get worker history (Excel Export)`);
        console.log(`Request reached from host ${clientIp} for work-flow-get worker history (Excel Export)`);
        logger.info(body);
        console.log(body);

        if (business_id && workerName && filterFlag && business_id !== "" && workerName !== "" && filterFlag !== "") {
            logger.info("Requesting DB connection...");
            connection = await pool.promise().getConnection();

            const queryConditions = [];
            const queryParams = [];

            if (case_id) {
                queryConditions.push("case_id = ?");
                queryParams.push(case_id);
            }
            if (fromDate) {
                queryConditions.push("DATE(date) >= ?");
                queryParams.push(fromDate);
            }
            if (endDate) {
                queryConditions.push("DATE(date) <= ?");
                queryParams.push(endDate);
            }
            if (jobStatus) {
                queryConditions.push("status = ?");
                queryParams.push(jobStatus);
            }

            const queryConditionString = queryConditions.length > 0 ? queryConditions.join(" AND ") : "1";

            let rows;
            if (filterFlag === "true") {
                const [result] = await connection.query(
                    `SELECT date, case_id, status, assigne
                     FROM work_flow_management
                     WHERE ${queryConditionString} AND business_id = ? AND assigne = ?
                     ORDER BY date DESC`,
                    [...queryParams, business_id, workerName]
                );
                rows = result;
            } else {
                const [result] = await connection.query(
                    `SELECT date, case_id, status, assigne
                     FROM work_flow_management
                     WHERE business_id = ? AND assigne = ?
                     ORDER BY date DESC`,
                    [business_id, workerName]
                );
                rows = result;
            }

            // Excel Generation
            const ExcelJS = require("exceljs");
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet("Worker History");

            worksheet.columns = [
                { header: "Date", key: "date", width: 20 , style: { alignment: { horizontal: "left" } } },
                { header: "Case ID", key: "case_id", width: 30 , style: { alignment: { horizontal: "center" } } },
                { header: "Status", key: "status", width: 22 , style: { alignment: { horizontal: "center" } } },
                { header: "Assignee", key: "assigne", width: 25 , style: { alignment: { horizontal: "center" } } },
            ];

            rows.forEach(row => {
                worksheet.addRow(row);
            });

            // Send Excel file as response
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=export_worker_history.xlsx");

            await workbook.xlsx.write(res);
            res.end();

            logger.info("Excel exported successfully");
            console.log("Excel exported successfully");

        } else {
            throw new Error("Some mandatory fields need to be filled");
        }

    } catch (err) {
        logger.error("Error processing Excel export:", err);
        console.error("Error processing Excel export:", err);
        res.status(400).send("Failed to export worker history");
    } finally {
        if (connection) connection.release();
    }
};

exports.exportMyWorks = async (req, res) => {
    let connection;
    try {
        const clientIp = req.socket.remoteAddress;
        const { business_id, fromDate, endDate, caseId, customerName, jobStatus, filterFlag } = req.query;

        logger.info(`Request reached from ${clientIp} for work-flow-get worker history (Excel Export)`);
        logger.info(req.query);

        if (!business_id) {
            throw new Error("Business ID is required");
        }

        connection = await pool.promise().getConnection();

        const queryConditions = ["w.business_id = ?"];
        const queryParams = [business_id];

        if (filterFlag === "true") {
            if (fromDate) {
                queryConditions.push("DATE(w.date) >= ?");
                queryParams.push(fromDate);
            }
            if (endDate) {
                queryConditions.push("DATE(w.date) <= ?");
                queryParams.push(endDate);
            }
            if (caseId) {
                queryConditions.push("w.case_id = ?");
                queryParams.push(caseId);
            }
            if (customerName) {
                queryConditions.push("c.customer_name = ?");
                queryParams.push(customerName);
            }
            if (jobStatus) {
                queryConditions.push("w.status = ?");
                queryParams.push(jobStatus);
            }
        }

        const whereClause = queryConditions.join(" AND ");

        const [rows] = await connection.query(
            `SELECT 
                c.customer_name,
                w.case_id,
                w.date,
                w.status 
             FROM case_registry c
             INNER JOIN work_flow_management w ON c.case_id = w.case_id
             WHERE ${whereClause}
             ORDER BY w.date DESC`,
            queryParams
        );

        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Worker History");

        worksheet.columns = [
            { header: "Case ID", key: "case_id", width: 30, style: { alignment: { horizontal: "center" } } },
            { header: "Customer Name", key: "customer_name", width: 25, style: { alignment: { horizontal: "center" } } },
            { header: "Status", key: "status", width: 22, style: { alignment: { horizontal: "center" } } },
            { header: "Date", key: "date", width: 20, style: { alignment: { horizontal: "left" } } },
        ];

        rows.forEach(row => worksheet.addRow(row));

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=myWorks_exports.xlsx");

        await workbook.xlsx.write(res);
        res.end();

        logger.info("Excel exported successfully");
    } catch (err) {
        logger.error("Error processing Excel export:", err);
        console.error("Error processing Excel export:", err);
        res.status(400).send("Failed to export myWorks");
    } finally {
        if (connection) connection.release();
    }
};


// My works filter
exports.myWorkFilter = async (req, res) => {
  let connection;
  try {
    // Input validation
    const schema = Joi.object({
      fromDate: Joi.date().allow('', null),
      endDate: Joi.date().allow('', null),
      customerName: Joi.string().allow('', null),
      caseId: Joi.number().integer().allow('', null),
      jobStatus: Joi.string().allow('', null),
      business_id: Joi.string().required(),
      page_number: Joi.number().integer().required(),
      sort_by: Joi.string().allow('', null).optional(),
      sort_order: Joi.string().allow('', null).optional(),
      e_mail: Joi.string().email().required(),
      filterFlag: Joi.string().required(),
      PAGE_ROWS: Joi.number().integer().optional()
    });

    logger.info("Validating input payload for myWorkFilterV2 API");
    const { error } = schema.validate(req.query);
    if (error) {
      logger.error(`Validation Error: ${error.details[0].message}`);
      throw new Error(`Validation Error: ${error.details[0].message}`);
    }

    // Extract and prepare variables
    const {
      fromDate,
      endDate,
      customerName,
      caseId,
      jobStatus,
      business_id,
      page_number,
      sort_by,
      sort_order,
      e_mail,
      filterFlag,
      PAGE_ROWS
    } = req.query;

    const count = parseInt(PAGE_ROWS, 10);
    logger.info(`Fetching work list for business_id: ${business_id}, user: ${e_mail}`);

    // Sorting validation
    const validSortColumns = ['date', 'case_id'];
    const validSortOrders = ['asc', 'desc'];

    const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
      ? sort_by
      : 'case_id';

    const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
      ? sort_order.toUpperCase()
      : 'DESC';

    // Get DB connection
    connection = await pool.promise().getConnection();
    logger.info("MySQL connection established for myWorkFilterV2");

    const queryConditions = [];
    const queryParams = [];

    if (fromDate) {
      queryConditions.push("DATE(cr.date) >= ?");
      queryParams.push(fromDate);
    }
    if (endDate) {
      queryConditions.push("DATE(cr.date) <= ?");
      queryParams.push(endDate);
    }
    if (customerName) {
      queryConditions.push("cr.customer_name LIKE CONCAT('%', ?, '%')");
      queryParams.push(customerName);
    }
    if (caseId) {
      queryConditions.push("cr.case_id = ?");
      queryParams.push(caseId);
    }
    if (jobStatus) {
      queryConditions.push("wfm.status = ?");
      queryParams.push(jobStatus);
    }

    queryConditions.push("cr.business_id = ?");
    queryConditions.push("wfm.business_id = ?");
    queryConditions.push("mu.e_mail = ?");
    queryParams.push(business_id, business_id, e_mail);

    const queryConditionString = queryConditions.length > 0 ? queryConditions.join(" AND ") : "1";
    logger.info(`Final query condition string: ${queryConditionString}`);

    // Paginated query
    const paginatedQuery = `
      SELECT 
        cr.customer_name,
        cr.case_id,
        cr.itam_name,
        cr.date,
        cr.delivery_date,
        wfm.assigne,
        wfm.status,
        wfm.case_status
      FROM case_registry cr
      INNER JOIN work_flow_management wfm ON cr.case_id = wfm.case_id
      INNER JOIN \`master-users\` mu ON mu.userName = wfm.assigne
      WHERE ${queryConditionString} AND wfm.status IN ('RETURN', 'INPROGRESS', 'REPEAT', 'CREATED')
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?;
    `;
    const paginatedParams = [...queryParams, count, (page_number - 1) * count];

    // // Totals query
    // const totalsQuery = `
    //   SELECT 
    //     COUNT(DISTINCT cr.case_id) AS totalJobs,
    //     COALESCE(SUM(CAST(cr.total_bill AS DECIMAL(10,2))), 0) AS totalBill,
    //     COALESCE(SUM(CAST(cr.balance AS DECIMAL(10,2))), 0) AS totalBalance
    //   FROM case_registry cr
    //   INNER JOIN work_flow_management wfm ON cr.case_id = wfm.case_id
    //   INNER JOIN \`master-users\` mu ON mu.userName = wfm.assigne
    //   WHERE ${queryConditionString};
    // `;
    // const totalsParams = [...queryParams];
    const [rows] = await connection.query(paginatedQuery, paginatedParams);
    // const [summary] = await connection.query(totalsQuery, totalsParams);

    // Fetch data based on filterFlag
    if (filterFlag === "true") {
      if (rows.length > 0) {
        logger.info(`Success: Retrieved ${rows.length} work records`);
        return res.status(200).json({
          statusDesc: "Success",
          statusCode: { code: "SC000" },
          message: "Got filtered work details successfully",
          params: {
            page_data: rows,
          },
        });
      } else {
        logger.warn("No work records found for given filters");
        return res.status(200).json({
          statusDesc: "Failure",
          statusCode: { code: "SC000" },
          message: "No work records found",
          params: {
            page_data: [],
          },
        });
      }

    } else if (filterFlag === "false") {
      const [rows] = await connection.query(`
        SELECT 
          cr.customer_name,
          cr.case_id,
          cr.itam_name,
          cr.date,
          cr.delivery_date,
          wfm.assigne,
          wfm.status,
          wfm.case_status
        FROM case_registry cr
        INNER JOIN work_flow_management wfm ON cr.case_id = wfm.case_id
        INNER JOIN \`master-users\` mu ON mu.userName = wfm.assigne
        WHERE  wfm.status IN ('RETURN', 'INPROGRESS', 'REPEAT', 'CREATED') AND cr.business_id = ? AND wfm.business_id = ? AND mu.e_mail = ?
        ORDER BY cr.date DESC, cr.case_id DESC
        LIMIT ? OFFSET ?;
      `, [business_id, business_id, e_mail, count, (page_number - 1) * count]);

      if (rows.length > 0) {
        logger.info("Success: Got work list successfully (no filter)");
        return res.status(200).json({
          statusDesc: "Success",
          statusCode: { code: "SC000" },
          message: "Got work list successfully",
          params: {
            page_data: rows,
          },
        });
      } else {
        logger.warn("No work records found (no filter)");
        return res.status(200).json({
          statusDesc: "Failure",
          statusCode: { code: "SC000" },
          message: "No work records found",
          params: {
            page_data: [],
          },
        });
      }
    }

  } catch (err) {
    logger.error(`Error in myWorkFilterV2: ${err.message}`);
    return res.status(500).json({
      statusDesc: "Failure",
      statusCode: { code: "F005" },
      message: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
};



//MyWorks summary 
exports.getMyWorksSummary = async (req, res) => {
    let connection;
    try {
        // Validate input
        const schema = Joi.object({
            business_id: Joi.string().required(),
            email: Joi.string().required(),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { business_id, email } = req.query;
        logger.info(`Starting My Works summary for business: ${business_id}, email: ${email}`);

        connection = await pool.promise().getConnection();

        // Check cache flag
        const [cacheFlag] = await connection.query(
            'SELECT cache_flag FROM myworks_summary_details WHERE business_id = ? AND email = ?;',
            [business_id, email]
        );

        if (cacheFlag.length && cacheFlag[0].cache_flag === 1) {
            // Fetch cached summary
            logger.info(`Cache is valid. Fetching from myworks_summary_details...`);
            const [summaryDetails] = await connection.query(
                `SELECT 
                COUNT(DISTINCT cr.case_id) AS totalJobs,
                COALESCE(SUM(CAST(cr.total_bill AS DECIMAL(10,2))), 0) AS totalRevenue,
                COALESCE(SUM(CAST(cr.balance AS DECIMAL(10,2))), 0) AS totalOutstandingBalance
            FROM case_registry cr
            INNER JOIN work_flow_management wfm ON cr.case_id = wfm.case_id
            INNER JOIN \`master-users\` mu ON mu.userName = wfm.assigne
            WHERE cr.business_id = ? AND wfm.business_id = ? AND mu.e_mail = ?
            ORDER BY cr.date DESC, cr.case_id DESC;`,
            [business_id, business_id, email]
            );

            logger.info(`Fetched cached data: ${JSON.stringify(summaryDetails)}`);
            return res.status(200).json({
                statusDesc: 'Success',
                statusCode: { code: 'SC000' },
                message: 'My Works summary fetched successfully (from cache)',
                param: summaryDetails[0],
            });
        }

        // Cache invalid, recalculate from main tables
        logger.info('Cache invalid. Recalculating My Works summary...');
        const [summary] = await connection.query(
            `SELECT 
                COUNT(DISTINCT cr.case_id) AS totalJobs,
                COALESCE(SUM(CAST(cr.total_bill AS DECIMAL(10,2))), 0) AS totalRevenue,
                COALESCE(SUM(CAST(cr.balance AS DECIMAL(10,2))), 0) AS totalOutstandingBalance
            FROM case_registry cr
            INNER JOIN work_flow_management wfm ON cr.case_id = wfm.case_id
            INNER JOIN \`master-users\` mu ON mu.userName = wfm.assigne
            WHERE cr.business_id = ? AND wfm.business_id = ? AND mu.e_mail = ?
            ORDER BY cr.date DESC, cr.case_id DESC;`,
            [business_id, business_id, email]
        );

        const recalculated = {
            totalJobs: summary[0]?.totalJobs || 0,
            totalRevenue: summary[0]?.totalRevenue || 0,
            totalOutstandingBalance: summary[0]?.totalOutstandingBalance || 0,
        };

        logger.info(`Recalculated summary: ${JSON.stringify(recalculated)}`);

        // Update cache
        await connection.query(
            `INSERT INTO myworks_summary_details 
                (business_id, email, total_jobs, total_revenue, total_outstanding_balance, cache_flag, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE 
                total_jobs = VALUES(total_jobs),
                total_revenue = VALUES(total_revenue),
                total_outstanding_balance = VALUES(total_outstanding_balance),
                cache_flag = 1,
                updated_at = CURRENT_TIMESTAMP;`,
            [business_id, email, recalculated.totalJobs, recalculated.totalRevenue, recalculated.totalOutstandingBalance]
        );

        logger.info('Cache updated successfully.');

        // Return response
        res.status(200).json({
            statusDesc: 'Success',
            statusCode: { code: 'SC000' },
            message: 'My Works summary recalculated and cached successfully',
            param: recalculated,
        });

    } catch (err) {
        logger.error(`Error fetching My Works summary: ${err.message}`);
        res.status(500).json({
            statusDesc: 'Failure',
            statusCode: { code: 'F005' },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};


//Create work order
exports.createWorkOrder = async (req, res) => {
    let connection;
    try {
        logger.info("Creating work order.");
        console.log("Creating work order.");

        const schema = Joi.object({
            customer_name: Joi.string().trim().allow('',null).optional(),
            phone_number: Joi.string().pattern(/^[0-9]{10}$/).allow('', null).optional(),
            comments: Joi.string().allow('',null).optional(),
            product_name: Joi.string().trim().optional(),
            serial_number: Joi.string().trim().optional(),
            business_id: Joi.string().trim().required(),
        });

        logger.info("Joi schema defined successfully");
        console.log("Joi schema defined successfully");

        //getting connetion
        logger.info("Attempting to get MySQL connection.");
        console.log("Attempting to get MySQL connection.");
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        //schema validation
        logger.info("Running schema validation on request body.");
        console.log("Running schema validation on request body.");
        const { error } = schema.validate(req.body);
        if (error) {
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        const {
            customer_name,
            phone_number,
            comments,
            product_name,
            serial_number,
            business_id,
        } = req.body;

        //inserting data into core_work_order_details table
        [rows] = await connection.execute(`SELECT string_value FROM core_work_order_seq WHERE business_id = ?`,[business_id])
        if (!rows[0]) {
            // Handle missing business_id
            throw new Error(`No sequence found for business_id: ${business_id}`);
        }
        const string_value = parseInt(rows[0].string_value, 10) + 1;
        const currentDate = new Date().toISOString().split("T")[0];
        logger.info("Inserting work order details.");
        console.log("Inserting work order details.");
        if(product_name) {
            logger.info( `Inserting work order details with query (using product name):
                INSERT INTO core_work_order_details (customer_name, phone_number, date, comments, product_name, work_order_no, business_id) VALUES (?, ?, ?, ?, ?, ?, ?)
                With values: [${customer_name}, ${phone_number}, ${currentDate}, ${comments}, ${product_name}, ${string_value}, ${business_id}]` );

            await connection.execute(
                `INSERT INTO core_work_order_details 
                (customer_name, phone_number, date, comments, product_name, work_order_no, business_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [customer_name, phone_number, currentDate, comments, product_name, string_value, business_id]
            );
        } else{
            logger.info( `Inserting work order details with query (using serial number):
                INSERT INTO core_work_order_details (customer_name, phone_number, date, comments, serial_number, work_order_no, business_id) VALUES (?, ?, ?, ?, ?, ?, ?)
                With values: [${customer_name}, ${phone_number}, ${currentDate}, ${comments}, ${serial_number}, ${string_value}, ${business_id}]` );

            await connection.execute(
                `INSERT INTO core_work_order_details 
                (customer_name, phone_number, date, comments, serial_number, work_order_no, business_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [customer_name, phone_number, currentDate, comments, serial_number, string_value, business_id]
            );
        }

        //core work order sequence table updation
        logger.info(`Updating work order sequence value for ${business_id}.`);
        console.log(`Updating work order sequence value for ${business_id}.`);

        await connection.query(
            `UPDATE core_work_order_seq SET string_value = ? WHERE business_id = ?`,
            [string_value, business_id]
        );

        logger.info("Committing transaction.");
        console.log("Committing transaction.");

        await connection.commit();

        logger.info("Work order created successfully.");
        console.log("Work order created successfully.");

        //Sending success response
        res.send({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "Work order created successfully",
        });
    } catch (err) {
        if (connection) {
            await connection.rollback();
        }

        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        //sending failure response
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};


//Get work order list
exports.getWorkOrderList = async (req, res) => {
    let connection;
    try {
        logger.info("Retrieving work order list.");
        console.log("Retrieving work order list.");

        // Input validation
        const schema = Joi.object({
            from_date: Joi.string().allow(null, ""),
            end_date: Joi.string().allow(null, ""),
            status: Joi.string().allow(null, ""),
            product_name: Joi.string().allow(null, ""),
            serial_number: Joi.string().allow(null, ""),
            page_number: Joi.number().integer().required(),
            business_id: Joi.string().required(),
            sort_by: Joi.string().allow('', null).optional(),
            sort_order: Joi.string().allow('', null).optional(),
            PAGE_ROWS: Joi.number().integer().required(),
        });

        logger.info(`Input validation for getting work order list.`);

        const { error } = schema.validate(req.query);
        if (error) {
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        //getting connetion
        logger.info("Attempting to get MySQL connection.");
        connection = await pool.promise().getConnection();
        

        const {
            from_date,
            end_date,
            status,
            product_name,
            serial_number,
            page_number,
            business_id,
            sort_by,
            sort_order,
            PAGE_ROWS
        } = req.query;
        
        const count = parseInt(PAGE_ROWS,10);

        
        // Allowed sort columns
        const validSortColumns = ['date', 'work_order_no',];
        const validSortOrders = ['asc', 'desc'];

        // Validate column and order
        const sortBy = (typeof sort_by === 'string' && validSortColumns.includes(sort_by))
        ? sort_by
        : 'work_order_no';

        const sortOrder = (typeof sort_order === 'string' && validSortOrders.includes(sort_order.toLowerCase()))
        ? sort_order.toUpperCase()
        : 'DESC';

        // Query building
        const queryConditions = [];
        const queryParams = [];

        logger.info('Initializing dynamic query conditions and parameters arrays');
        console.log('Initializing dynamic query conditions and parameters arrays');

        if (from_date) {
            logger.info(`Work order from_date ${from_date} is pushed`);
            queryConditions.push("DATE(date) >= ?");
            queryParams.push(from_date);
        }

        if (end_date) {
            logger.info(`Work order end_date ${end_date} is pushed`);
            queryConditions.push("DATE(date) <= ?");
            queryParams.push(end_date);
        }

        if (status) {
            logger.info(`Work order status ${status} is pushed`);
            queryConditions.push("status = ?");
            queryParams.push(status);
        }

        if (product_name) {
            logger.info(`Work order product_name ${product_name} is pushed`);
            queryConditions.push("product_name LIKE ?");
            queryParams.push(`%${product_name}%`);
        }

        if (serial_number) {
            logger.info(`Work order serial_number ${serial_number} is pushed`);
            queryConditions.push("serial_number = ?");
            queryParams.push(serial_number);
        }

        // Create query condition string by joining the conditions with 'AND'
        const queryConditionString =
        queryConditions.length > 0 ? queryConditions.join(" AND ") : "1";  // Default to '1' if no conditions

        logger.info('Constructed query condition string', {queryConditionString});
        console.log('Constructed query condition string', {queryConditionString});

        // Query for paginated data
        const paginatedQuery = ` SELECT cd.id, cd.customer_name, cd.phone_number, cd.date, cd.comments, cd.product_name, cd.serial_number, cd.work_order_no, cd.status, sd.status_value FROM core_work_order_details cd JOIN core_work_order_status_desc sd ON cd.status = sd.status_id WHERE ${queryConditionString} AND cd.business_id = ? ORDER BY ${sortBy} ${sortOrder} ,cd.work_order_no DESC  LIMIT ? OFFSET ?;`;

        logger.info('Constructed paginated query for case registry', {query: paginatedQuery,conditionString: queryConditionString});
        console.log('Constructed paginated query for case registry', {query: paginatedQuery,conditionString: queryConditionString});

        const paginatedParams = [
            ...queryParams, 
            business_id,
            count, 
            (page_number - 1) * count
        ];

        logger.info('Prepared parameters for paginated query', {paginatedParams});
        console.log('Prepared parameters for paginated query', {paginatedParams});

        const [rows] = await connection.query(paginatedQuery, paginatedParams);

        if (rows.length > 0) {
            return res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Fetched work order successfully",
                data: rows,
            });
        } else {
            return res.status(200).json({
                statusDesc: "Failure",
                statusCode: { code: "SC000" },
                message: "No work orders found",
                data: [],
            });
        }
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        res.status(500).json({
        statusDesc: "Failure",
        statusCode: { code: "F005" },
        message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};


exports.updateWorkOrderStatus = async (req, res) => {
    let connection;
    try {
        logger.info("Updating work order status.");
        console.log("Updating work order status.");

        const schema = Joi.object({
            id: Joi.number().integer().required(),
            status: Joi.number().integer().required(),
            business_id: Joi.string().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        const { 
            id,
            status,
            business_id
        } = req.body;

        //getting connetion
        logger.info("Attempting to get MySQL connection.");
        console.log("Attempting to get MySQL connection.");

        connection = await pool.promise().getConnection();

        logger.info(`Executing query: UPDATE core_work_order_details SET status = ${status} WHERE id = ${id} AND business_id = ${business_id}`);

        const [updateResult] = await connection.query(
            'UPDATE core_work_order_details SET status = ? WHERE id = ? AND business_id = ? ',
            [status, id, business_id]
        );

        logger.info(`Query result: ${JSON.stringify(updateResult)}`);

        if (updateResult.affectedRows > 0) {
            logger.info(`Sending response: ${JSON.stringify({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Work order status updated successfully"
            })}`);
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Work order status updated successfully"
            });
        } else {
            logger.info(`Sending response: ${JSON.stringify({
                statusDesc: "Failure",
                statusCode: { code: "F005" },
                message: "No matching status found."
            })}`);
            res.status(500).json({
                statusDesc: "Failure",
                statusCode: { code: "F005" },
                message: "No matching status found."
            });
        }

    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        logger.info(`Sending error response: ${JSON.stringify({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        })}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
}; 

//Get User policy
exports.userPlolicyDetails = async (req, res) => {
    let connection;
    try {
        logger.info("User Policy fetching");
        console.log("User Policy fetching");
        
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, event } = body;

        logger.info(body);
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for "User Policy fetching`);
        console.log(`Request reached from host ${clientIp} for "User Policy fetching`);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id && event && business_id !== "" && event !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Establish database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            const [rows] = await connection.query('SELECT package_code FROM `license_master` WHERE business_id = ? AND status = "ACTIVE"', [business_id]);

            if (rows.length >= 1) {

                //validating user pkgh
                if(rows[0].package_code === "JPLIC001"){

                    //user with free trail fetching requred event policy
                    const [limit] = await connection.query('SELECT limit_count FROM `core_user_activity_policy_details` WHERE event = ?', [event]);

                    logger.info(`response send: statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "User has a premimum package"`);
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "User has a free package",
                        param: {
                            isCheck : 1,
                            limit: limit[0].limit_count
                        }
                    })
                }else{
                    logger.info(`response send: statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "User has a premimum package"`);
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "User has a premimum package",
                        param: {
                            isCheck : 0,
                            limit: 0
                        }
                    })
                }
            } else {
                // If no matching delivery order ID found
                logger.error("User Not suscribed any package");
                console.error("User Not suscribed any package");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "User Not suscribed any package"
                });
            }

        } else {
            logger.error('Some parameter is missing');
            console.error('Some parameter is missing');
            const error = new Error('Some parameter is missing');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//message credit update
exports.notificationCreditUpdate = async (req, res) => {
    let connection;
    try {
        logger.info("Updating work order status.");
        console.log("Updating work order status.");

        const schema = Joi.object({
            business_id: Joi.string().required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            logger.error(`Validation Error: ${error.details[0].message}`);
            console.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        const { 
            business_id
        } = req.body;

        //getting connetion
        logger.info("Attempting to get MySQL connection.");
        console.log("Attempting to get MySQL connection.");

        connection = await pool.promise().getConnection();

        logger.info(`Executing query: UPDATE core_notification_credit_master SET credit = credit - 1 WHERE business_id = ?`);

        const [updateResult] = await connection.query(
            'UPDATE core_notification_credit_master SET credit = credit - 1 WHERE business_id = ?',
            [business_id]
        );

        logger.info(`Query result: ${JSON.stringify(updateResult)}`);

        if (updateResult.affectedRows > 0) {
            logger.info(`Sending response: ${JSON.stringify({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Credit updated successfully"
            })}`);
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Credit updated successfully"
            });
        } else {
            logger.info(`Sending response: ${JSON.stringify({
                statusDesc: "Failure",
                statusCode: { code: "F005" },
                message: "No matching status found."
            })}`);
            res.status(500).json({
                statusDesc: "Failure",
                statusCode: { code: "F005" },
                message: "No matching status found."
            });
        }

    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        logger.info(`Sending error response: ${JSON.stringify({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        })}`);
        res.status(500).json({
        statusDesc: "Failure",
        statusCode: { code: "F005" },
        message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};
         
//removal repair case image
exports.removeRepairImage = async (req, res) => {
    let connection;
    try {
        logger.info("Repair case image removal request initiated.");
        console.log("Repair case image removal request initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const body = req.body;

        logger.info(`Request received from IP: ${clientIp}`);
        logger.info("Request body:", body);
        console.log(`Request received from IP: ${clientIp}`);
        console.log("Request body:", body);

        const {case_id, business_id} = body;

        logger.info(body);
        console.log(body);

        // Get database connection
        connection = await pool.promise().getConnection();

        logger.info("Database connection established.");
        console.log("Database connection established.");

        // Remove image from work_flow_management table
        const[result] = await connection.query('UPDATE `work_flow_management` SET comment_image = "" WHERE case_id = ? AND business_id = ?', 
            [case_id, business_id]);
        
        console.log("Rows affected:", result.affectedRows);
        logger.info(`Rows affected: ${result.affectedRows}`);

        if (result.affectedRows === 0) {
            throw new Error("No record found for the given case_id and business_id");
        }

        // Respond with success
        res.status(200).json({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "Repair case image removed successfully",
        });
        logger.info("Repair case image removed successfully");
        console.log("Repair case image Removed successfully");

    } catch (err) {
        logger.error("Error during removal:", err);
        console.error("Error during removal:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
}; 

//Get notifuication credit
exports.notificationCrditCheck = async (req, res) => {
    let connection;
    try {
        logger.info("User Policy fetching");
        console.log("User Policy fetching");
        
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id} = body;
        logger.info(body);
        console.log(body);
      
        // Logging
        logger.info(`Request reached from host ${clientIp} for "User Policy fetching`);
        console.log(`Request reached from host ${clientIp} for "User Policy fetching`);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id && business_id !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Establish database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            const [credit] = await connection.query('SELECT credit FROM `core_notification_credit_master` WHERE business_id = ?', [business_id]);

            if (credit.length >= 1) {

                //validating user pkgh
                if(credit[0].credit > 0){

                    //user with free trail fetching requred event policy
                    const [tafis] = await connection.query('SELECT jet_slab_1_charge FROM `core_notification_charges_configs`', []);

                    logger.info(`response send: statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "User eligible for sending notification"`);
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "User eligible for sending notification",
                        param: {
                            isSend : 1
                        }
                    })
                }else{
                    logger.info(`response send: statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "User not eligible for sending notification"`);
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "User not eligible for sending notification",
                        param: {
                            isSend : 0
                        }
                    })
                }
            } else {
                // If no matching delivery order ID found
                logger.error("Someting went wrong , No details found");
                console.error("Someting went wrong , No details found");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "Someting went wrong , No details found"
                });
            }

        } else {
            logger.error('Some parameter is missing');
            console.error('Some parameter is missing');
            const error = new Error('Some parameter is missing');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
             });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};
          
exports.uploadRepairImage = async (req, res) => {
    let connection;
    try {
        logger.info("Repair case image upload request initiated.");
        console.log("Repair case image upload request initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const body = req.body;

        logger.info(`Request received from IP: ${clientIp}`);
        logger.info("Request body:", body);
        console.log(`Request received from IP: ${clientIp}`);
        console.log("Request body:", body);

        const { case_id, business_id, image_name } = body;
        if (!case_id || !business_id) {
            throw new Error("Some mandatory fields are missing");
        }

        const image_url = `${MEDIA_URL}/${image_name}`;

        logger.info(`Repair case image URL generated: ${image_url}`);
        console.log(`Repair case image URL generated: ${image_url}`);

        // Get database connection
        connection = await pool.promise().getConnection();

        logger.info("Database connection established.");
        console.log("Database connection established.");

        // Update image into work_flow_management table
        const [result] = await connection.query(
            'UPDATE `work_flow_management` SET comment_image = ? WHERE case_id = ? AND business_id = ?',
            [image_url, case_id, business_id]
        );

        logger.info(`Rows affected: ${result.affectedRows}`);
        console.log("Rows affected:", result.affectedRows);

        if (result.affectedRows === 0) {
            throw new Error("No record found for given case_id and business_id");
        }

        res.status(200).json({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "Repair case image uploaded successfully",
            imagePath: image_url
        });

        logger.info("Repair case image uploaded successfully");
        console.log("Repair case image uploaded successfully");

    } catch (err) {
        logger.error("Error during upload:", err);
        console.error("Error during upload:", err);

        res.status(400).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};


//Get messageTarif
exports.getMessageTarrif = async (req, res) => {
    let connection;
    try {
        logger.info("User Policy fetching");
        console.log("User Policy fetching");
        
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id } = body;

        logger.info(body);
        console.log(body);

        // Logging
        logger.info(`Request reached from host ${clientIp} for "User Policy fetching`);
        console.log(`Request reached from host ${clientIp} for "User Policy fetching`);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id &&  business_id !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Establish database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            const [rows] = await connection.query('SELECT package_code FROM `license_master` WHERE business_id = ? AND status = "ACTIVE"', [business_id]);

            if (rows.length >= 1) {
                
                const [tarif] = await connection.query('SELECT jet_slab_1_charge,jet_slab_2_charge,3pp_charge AS commision,meta_charge FROM `core_notification_charges_configs`', []);
                
                //validating user pkgh
                if(rows[0].package_code === "JPLIC001"){

                    //user with free trail fetching requred event policy
                    const finalTarrif = (tarif[0].jet_slab_1_charge + tarif[0].commision + tarif[0].meta_charge)

                    logger.info(`response send: statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "User has a premimum package"`);
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "User has a free package",
                        param: {
                            isFree : 1,
                            tariff: finalTarrif
                        }
                    })
                }else{
                    const finalTarrif = (tarif[0].jet_slab_2_charge + tarif[0].commision + tarif[0].meta_charge)

                    logger.info(`response send: statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "User has a premimum package"`);
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "User has a premimum package",
                         param: {
                            isFree : 0,
                            tariff: finalTarrif
                        }
                    })
                }
            } else {
                // If no matching delivery order ID found
                logger.error("User Not suscribed any package");
                console.error("User Not suscribed any package");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "User Not suscribed any package"
                });
            }

        } else {
            logger.error('Some parameter is missing');
            console.error('Some parameter is missing');
            const error = new Error('Some parameter is missing');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error('Error processing request:', err);
        console.error('Error processing request:', err);
        res.status(422).json({
            statusDesc: "Failure",
            statusCode: err.code || 'F005',
            message: err.message,
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};
exports.updatePartyDetails = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
            party_id: Joi.number().integer().min(1).required(),
            customer_name: Joi.string().trim().min(1).required(),
            customer_phone_number: Joi.string().pattern(/^[0-9]{10}$/).required(),
            billing_adress: Joi.string().trim().min(1).required(),
            business_id: Joi.string().trim().required()
        });

        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const {
            party_id,
            customer_name,
            customer_phone_number,
            billing_adress,
            business_id
        } = req.body;

        connection = await pool.promise().getConnection();

        const [updateResult] = await connection.query(
            `UPDATE party_details 
             SET customer_name = ?, phone_number = ?, billing_adress = ? 
             WHERE id = ? AND business_id = ?`,
            [customer_name, customer_phone_number, billing_adress, party_id, business_id]
        );

        if (updateResult.affectedRows > 0) {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Party details updated successfully",
                data: {
                    party_id,
                    updated_fields: {
                        customer_name,
                        billing_adress
                    }
                }
            });
        } else {
            res.status(404).json({
                statusDesc: "Failure",
                statusCode: { code: "F004" },
                message: "No matching party found to update"
            });
        }

    } catch (err) {
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

function generateTicketIdReadable(prefix = "JT") {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const datePart = `${y}${m}${d}`;               // 20251102
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 chars
  return `${prefix}-${datePart}-${suffix}`;
}

//Customer Support Submit API
exports.createCustomerSupport = async (req, res) => {
    let connection;
    try {
        logger.info("Creating customer support entry.");
        console.log("Creating customer support entry.");

        // 1. Joi validation
        const schema = Joi.object({
            business_id: Joi.string().trim().required(),
            message: Joi.string().trim().required(),
        });

        logger.info("Joi schema defined successfully");

        const { error } = schema.validate(req.body);
        if (error) {
            logger.error(`Validation Error: ${error.details[0].message}`);
            throw new Error(`Validation Error: ${error.details[0].message}`);
        }

        const { business_id, message } = req.body;
        const ticket_id = generateTicketIdReadable()
        // 2. Get DB connection
        logger.info("Attempting to get MySQL connection.");
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        // 3. Fetch user details
        const [userRows] = await connection.execute(
            `SELECT relam_id, full_name, e_mail, phone_number 
             FROM \`master-users\`
             WHERE business_id = ?`,
            [business_id]
        );

        if (!userRows[0]) {
            throw new Error(`No user found for business_id: ${business_id}`);
        }

        const { relam_id, full_name, e_mail, phone_number } = userRows[0];

        // 4. Fetch company details
        const [companyRows] = await connection.execute(
            `SELECT compnay_name, company_address 
             FROM relam_master 
             WHERE relam_id = ?`,
            [relam_id]
        );

        if (!companyRows[0]) {
            throw new Error(`No company found for realm_id: ${relam_id}`);
        }

        const { compnay_name, company_address } = companyRows[0];

        // 5. Insert into customer_support_table
        logger.info("Inserting customer support details.");
        await connection.execute(
            `INSERT INTO customer_support_table 
            (company_name, full_name, message, phone_number, email,ticket_id, company_address, business_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?,?)`,
            [compnay_name,full_name,message,phone_number,e_mail,ticket_id,company_address,business_id]
        );

        // 6. Commit transaction
        await connection.commit();

        //sending mail 
        // Send email notification
        let subject = `New Support Ticket Received ${ticket_id}`
        const payload = {
            request_id: "0001",
            to_adress: support_mail,
            template_id: "1203",
            subject: subject,
            params: { 
                company_name: compnay_name,
                full_name:full_name,
                contact_number:phone_number,
                company_address:company_address,
                customer_message:message
            }
        };

        try {
            await axios.post(`${NMS_URL}/genericSendEmailNotification`, payload);

            logger.info(`Email sent successfully using API: POST ${NMS_URL}/genericSendEmailNotification`);
            console.log(`Email sent successfully using API: POST ${NMS_URL}/genericSendEmailNotification`);

        } catch (emailError) {
            logger.error("Error sending email:", emailError);
            console.error("Error sending email:", emailError);
        }
        logger.info("Customer support entry created successfully.");
        res.send({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "Customer support entry created successfully",
        });
    } catch (err) {
        if (connection) await connection.rollback();
        logger.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
        logger.info("Database connection released");
    }
};


//adding new Customer
exports.createnewcustomer = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;
        
        // Logging
        logger.info(`Request reached from host ${clientIp} for add new dealer and request packet:`);
        console.log(`Request reached from host ${clientIp} for add new dealer and request packet:`);
        logger.info(body);
        console.log(body);

        // Parameterization
        const { customer_name, customer_number,customer_email, customer_address,alternate_phone_no, business_id } = body;

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");
        if (customer_name && customer_number && business_id && customer_name !== "" && customer_number !== "" && business_id !== "") {

            // Phone number validation
            const lengthRegex = /^\d{10}$/;
            if (lengthRegex.test(customer_number)) {

                // Establish database connection
                logger.info("getting database connection");
                console.log("getting database connection");
                connection = await pool.promise().getConnection();
                logger.info("database connection established");
                console.log("database connection established");

                // Check if dealer already exists
                const [rows] =await connection.query(
            'SELECT * FROM `party_details` WHERE phone_number = ?',
            [customer_number])
                if (rows.length >= 1) {
                    // Dealer already exists
                    logger.error("Customer already exists");
                    console.error("Customer already exists");
                    res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "F0015" },
                        message: "Customer already exists"
                    });
                } else {
                    // Insert new dealer
                    const [result] = await connection.query('INSERT INTO `party_details` (customer_name, phone_number, email, alternate_phone_number, business_id, billing_adress) VALUES (?, ?, ?, ?, ?, ?)', 
                        [customer_name, customer_number, customer_email,alternate_phone_no, business_id, customer_address]);
                    
                    const insertedId = result.insertId;

                    logger.info("New Customer added successfully");
                    console.log("New Customer added successfully");
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "New Customer added successfully",
                        customerid : insertedId
                    });
                }

            } else {
                logger.error("Primary validation error: Not a valid phone number");
                console.error("Primary validation error: Not a valid phone number");
                const error = new Error("Not a valid phone number");
                error.code = "F0011";
                throw error;
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }

    } catch (err) {
        logger.error("Error processing request:", err);
        console.error("Error processing request:", err);
        res.status(400).json({
            statusDesc: "Failure",
            statusCode: err.code || "F005",
            message: err.message
        });
    } finally {
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//Partner get partner details
    exports.getcustomerlist = async (req, res) => {
        let connection;
           try {

        //input validation
        const schema = Joi.object({
            customer_name: Joi.string().allow(null, ''),
            customer_no: Joi.string().allow(null, ''),
            page_number: Joi.number().integer().required(),
            business_id: Joi.string().required(),
            PAGE_ROWS: Joi.number().integer().required(),

        });
        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        //getting connetion
        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");
        
        

        const {business_id,customer_name,page_number,customer_no,PAGE_ROWS} = req.query
        const count =parseInt(PAGE_ROWS,10);
        //condition check
        if(customer_name == "" && customer_no == ""){
           //no filter condition 
           // Query to get dealer details
           const [rows] = await connection.query(
                `SELECT *
                FROM party_details
                WHERE business_id = ?
                LIMIT ? OFFSET ?;`,
                    [business_id, count, (page_number - 1) * count]
            );
            if (rows.length > 0) {
                logger.info("Got Customer details successfully");
                console.log("Got Customer details successfully");
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Got Customer list successfully",
                    params: rows
                });
            } else {
                logger.error("No Cusotmers found");
                console.error("No Customers found");
                return res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "SC000" },
                    message: "No Customer list found",
                    params: []
                });
            }
        }
        if(customer_name != "" && customer_no == ""){
                //product filtee
                const [rows] = await connection.query(
                    `SELECT *
                FROM party_details
                WHERE business_id = ?
                AND customer_name = ?
                    LIMIT ? OFFSET ?;`,
                    [business_id, customer_name,count,(page_number - 1) * count]
                );
                if (rows.length > 0) {
                    logger.info("Got Customer details successfully");
                    console.log("Got Customer details successfully");
                    return res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Got Customer list successfully",
                        params: rows
                    });
                } else {
                    logger.error("No Customers found");
                    console.error("No Customers found");
                    return res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "SC000" },
                        message: "No Customer list found",
                        params: []
                    });
                }
            }
        if(customer_name == "" && customer_no != ""){
                //product filtee
                const [rows] = await connection.query(
                    `SELECT *
                FROM party_details
                WHERE business_id = ?
                AND phone_number = ?
                    LIMIT ? OFFSET ?`,
                    [business_id, customer_no,count,(page_number - 1) * count]
                );
                if (rows.length > 0) {
                    logger.info("Got Customer details successfully");
                    console.log("Got Customer details successfully");
                    return res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Got Customer list successfully",
                        params: rows
                    });
                } else {
                    logger.error("No Customer found");
                    console.error("No Customer found");
                    return res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "SC000" },
                        message: "No Customer list found",
                        params: []
                    });
                }
            }
        else{
            //filter condition
            if(customer_name != "" && customer_no != ""){
                //product filtee
                const [rows] = await connection.query(
                    `SELECT *
                FROM party_details
                WHERE business_id = ?
                AND phone_number = ?
                AND customer_name = ?
                    LIMIT ? OFFSET ?;`,
                    [business_id,customer_no, customer_name,count,(page_number - 1) * count]
                );
                if (rows.length > 0) {
                    logger.info("Got Customer details successfully");
                    console.log("Got Customer details successfully");
                    return res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Got Customer list successfully",
                        params: rows
                    });
                } else {
                    logger.error("No Customer found");
                    console.error("No Customer found");
                    return res.status(200).json({
                        statusDesc: "Failure",
                        statusCode: { code: "SC000" },
                        message: "No Customer list found",
                        params: []
                    });
                }
            }
            
        }
    }
    catch(err){
    logger.error(`Error processing request: ${err.message}`);
    console.error(`Error processing request: ${err.message}`);
    res.status(500).json({
        statusDesc: "Failure",
        statusCode: { code: "F005" },
        message: err.message,
    });
    }finally{
    if (connection) connection.release();
    }
}

//view partner
exports.viewpartner = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
            id: Joi.string().required(),
            business_id: Joi.string().required(),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { id, business_id } = req.query;

        logger.info("getting database connection");
        console.log("getting database connection");
        connection = await pool.promise().getConnection();
        logger.info("database connection established");
        console.log("database connection established");

        const [rows] = await connection.query(
            `SELECT *
                    FROM party_details
                    WHERE business_id = ?
                    AND id = ?;`,
               [business_id,id]
        );

        if (rows.length > 0) {
            return res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got Customer details successfully",
                params: rows,
            });
        } else {
            return res.status(200).json({
                statusDesc: "Failure",
                statusCode: { code: "F0015" },
                message: "No Customer found",
            });
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};

//update partner
exports.updatecustomer = async (req, res) => {
    let connection;
    try {
        const schema = Joi.object({
                id:Joi.string().required(),
                customer_name: Joi.string().required(),
                customer_no: Joi.string().required(),
                customer_email: Joi.string().allow('').email().optional(),
                customer_address: Joi.string().allow('').optional(),
                customer_alternate_no: Joi.string().allow('').optional(),
                business_id: Joi.string().required()
        });

        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const {id,customer_name, customer_no, customer_email,customer_address,customer_alternate_no,business_id } = req.body;

        const lengthRegex = /^\d{10}$/;
            if (lengthRegex.test(customer_no)) {
                
            logger.info("getting database connection");
            console.log("getting database connection");
            connection = await pool.promise().getConnection();
            logger.info("database connection established");
            console.log("database connection established");

            const [updateResult] = await connection.query(
                'UPDATE party_details SET customer_name = ?,phone_number=?,email=?,alternate_phone_number=?,billing_adress=? WHERE id = ?  AND business_id = ?',
                [customer_name, customer_no,customer_email,customer_alternate_no,customer_address,id, business_id]
            );

            if (updateResult.affectedRows > 0) {
                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Customer updated."
                });
            } else {
                res.status(500).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "No Customer."
                });
            }
        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error("Some mandatory fields need to be filled");
            error.code = "F001";
            throw error;
        }
    } catch (err) {
        logger.error(`Error in updatecustomerstatus: ${err.message}`);
        console.error(`Error in updatecusotmerstatus: ${err.message}`);
        res.status(422).json({
              statusDesc: "Failure",
              statusCode: err.code || 'F005',
              message: err.message,
          });
      } finally {
          if (connection) connection.release(); // Ensure the connection is released back to the pool
      }
};
exports.insertReceivedSerialNumberV1 = async (req, res) => {
    let connection;

    try {
        logger.info("InsertReceivedSerialNumber API initiated.");
        console.log("InsertReceivedSerialNumber API initiated.");

        const schema = Joi.object({
            case_id: Joi.string().required(),
            business_id: Joi.string().required(),
            received_serial_number: Joi.string().required()
        });

        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { case_id, business_id, received_serial_number } = req.body;

        logger.info(`Updating case registry with received_serial_number for case_id: ${case_id}, business_id: ${business_id}`);
        console.log(`Updating case registry with received_serial_number for case_id: ${case_id}, business_id: ${business_id}`);

        connection = await pool.promise().getConnection();

        //Update case_registry
        const [result] = await connection.query(
            `UPDATE case_registry 
             SET received_serial_number = ?
             WHERE case_id = ? AND business_id = ?`,
            [received_serial_number, case_id, business_id]
        );

        if (result.affectedRows > 0) {
            logger.info("Received serial number inserted successfully into case registry.");
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Received serial number inserted successfully."
            });
        } else {
            throw new Error("No matching case_id and business_id found in case registry.");
        }

    } catch (err) {
        logger.error(`Error inserting received serial number: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        if (connection) connection.release();
    }
};


exports.getgrandtotal = async (req, res) => {
    let connection;
    try {
        // Input validation
        const schema = Joi.object({
            business_id: Joi.string().required(),
            customer_id: Joi.string().required(),

        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        
        connection = await pool.promise().getConnection(); // Get a connection from the pool

        const { business_id,customer_id } = req.query;
        logger.debug('Extracted business_id from query', { business_id });
        console.log('Extracted business_id:', business_id);
        // Query to fetch asset statuses
        const [rows] = await connection.query(`SELECT SUM(total_bill) AS total_bill FROM case_registry WHERE party_id = ? AND business_id = ?;`
            ,[customer_id,business_id]
        );

        if (rows.length > 0) {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got Grand Total",
                params:rows,
            });
            logger.info(`Fetched ${rows.length} Totals successfully`);
            console.log(`Fetched ${rows.length} Totals successfully`);
        } else {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "No Total found for this business id",
                param: "No Data",
            });
            logger.info("No Total  found for the given business ID");
            console.log("No Total found for the given business ID");
        }
    } catch (err) {
        logger.error(`Error processing request: ${err.message}`);
        console.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    } finally {
        logger.info('Releasing database connection back to pool');
        console.log('Releasing database connection back to pool');
        if (connection) connection.release(); // Ensure the connection is released back to the pool
    }
};

//Update payment from ledger
exports.paymentInsertion = async (req, res) => {
    let connection;
    try {
        logger.info(`Starting payment ledger insertion`);
        //inpu validation
        //input validation
        const schema = Joi.object({
            cutsomer_id: Joi.number().integer().required(),
            document_number:Joi.string().required(),
            amount:Joi.number().integer().required(),
            business_id: Joi.string().required()
        });

        //getting connetion
        connection = await pool.promise().getConnection();

        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const {cutsomer_id,document_number,amount,business_id} = req.body

        //sale retun linking
        const [existingSale] = await connection.query(
            'SELECT advance,balance FROM `case_registry` WHERE case_id = ? AND business_id = ?',
            [document_number, business_id]
        );
            
        if (existingSale.length === 0) {
            logger.error(`Invalid Document Id: ${document_number}`);
            throw new Error('Invalid Document Id');
        }else{

            //NEW PAYMENT CALULATION
            let new_receved_amout = (existingSale[0].advance + amount)
            let new_balance_amount = (existingSale[0].balance - amount)

            if(new_balance_amount < 0){
                logger.error(`Excess amount cannot be accepted for this document ID: ${document_number}`);
                throw new Error('Excess amount cannot be accepted for this document ID');
            }
            //updating new payment
            const [result] = await connection.query(
                'UPDATE `case_registry` SET advance = ? , balance = ? WHERE case_id = ? AND business_id = ?',
                [new_receved_amout,new_balance_amount,document_number, business_id]
            );

            // Check if row updated
            if (result.affectedRows === 0) {
                logger.error(`No rows updated for Document ID: ${document_number}, Business: ${business_id}`);
                return res.status(400).send({
                    statusDesc: "Failure",
                    statusCode: { code: "F005" },
                    message: "Invalid Case or No update applied",
                });
            }else{
                //core cache flag
                await connection.query(
                    `UPDATE core_job_sheet_summary_details SET cache_flag = ? WHERE business_id = ?`,
                    [0,business_id]
                );
                logger.info(`Cache flag reset for business_id: ${business_id}`);
                console.log(`Cache flag reset for business_id: ${business_id}`);

                logger.info(`Payment updated successfully for Case ID ${document_number}`);
                return res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Payment updated successfully",
                });
            }
        }
        
    }catch(err){
        logger.error(`Error processing request: ${err}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    }finally{
        if (connection) connection.release();
    }
}


exports.getSaleProfitlist = async (req, res) => {
  let connection;
  try {
    const schema = Joi.object({
      from_date: Joi.string().allow(null, ''),
      end_date: Joi.string().allow(null, ''),
      page_number: Joi.number().integer().min(1).required(),
      filterFlag: Joi.string().required(),
      business_id: Joi.string().required(),
    });

    logger.info(`Validating input payload for getting Sale Profit Report`);
    const { error } = schema.validate(req.query);
    if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

    logger.info("Attempting to get MySQL connection.");
    connection = await pool.promise().getConnection();

    const {
      from_date,
      end_date,
      page_number,
      filterFlag,
      business_id
    } = req.query;

    const count = 20;

    const queryConditions = [];
    const queryParams = [];

    if (from_date) {
      queryConditions.push("DATE(date) >= ?");
      queryParams.push(from_date);
    }

    if (end_date) {
      queryConditions.push("DATE(date) <= ?");
      queryParams.push(end_date);
    }

    const queryConditionString =
      queryConditions.length > 0 ? queryConditions.join(' AND ') : '1';

    const paginatedQuery = `
      SELECT 
        id,
        total_sale,
        total_sale_return,
        net_sale,
        cogs,
        cogr,
        net_cog,
        net_profit,
        margin,
        date
      FROM rpt_slae_profit_report
      WHERE ${queryConditionString} AND business_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?;
    `;
    const paginatedParams = [...queryParams, business_id, count, (page_number - 1) * count];

    const totalsQuery = `
      SELECT 
        ROUND(SUM(net_sale), 2) AS net_sale,
        ROUND(SUM(net_profit), 2) AS net_profit
      FROM rpt_slae_profit_report
      WHERE ${queryConditionString} AND business_id = ?;
    `;
    const totalsParams = [...queryParams, business_id];

    if (filterFlag === "true") {
      const [rows] = await connection.query(paginatedQuery, paginatedParams);
      const [summaryDetails] = await connection.query(totalsQuery, totalsParams);

      if (rows.length > 0) {
        logger.info("Success: Got Sale Profit Report successfully (filtered)");
        return res.status(200).json({
          statusDesc: "Success",
          statusCode: { code: "SC000" },
          message: "Got Sale Profit Report successfully",
          params: {
            page_data: rows,
            summary: summaryDetails
          },
        });
      } else {
        logger.error("Failure: No Sale Profit Report data found (filtered)");
        return res.status(200).json({
          statusDesc: "Failure",
          statusCode: { code: "SC000" },
          message: "No Sale Profit Report data found",
          params: {
            page_data: [],
            summary: [],
          },
        });
      }
    } 
    else if (filterFlag === "false") {
      const [rows] = await connection.query(
        `
        SELECT 
          id,
          total_sale,
          total_sale_return,
          net_sale,
          cogs,
          cogr,
          net_cog,
          net_profit,
          margin,
          date
        FROM rpt_slae_profit_report
        WHERE business_id = ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?;
        `,
        [business_id, count, (page_number - 1) * count]
      );

      if (rows.length > 0) {
        logger.info("Success: Got Sale Profit Report successfully (unfiltered)");
        return res.status(200).json({
          statusDesc: "Success",
          statusCode: { code: "SC000" },
          message: "Got Sale Profit Report successfully",
          params: {
            page_data: rows,
            summary: [],
          },
        });
      } else {
        logger.error("Failure: No Sale Profit Report data found (unfiltered)");
        return res.status(200).json({
          statusDesc: "Failure",
          statusCode: { code: "SC000" },
          message: "No Sale Profit Report data found",
          params: {
            page_data: [],
            summary: [],
          },
        });
      }
    }
  } catch (err) {
    logger.error(`Error processing request: ${err.message}`);
    res.status(500).json({
      statusDesc: "Failure",
      statusCode: { code: "F005" },
      message: err.message,
    });
  } finally {
    if (connection) connection.release();
  }
};



exports.profitrptSummary = async (req, res) => {
    let connection;
    try {
        
        //input validation
        const schema = Joi.object({
            business_id: Joi.string().required()
        });

        //getting connetion
        connection = await pool.promise().getConnection();

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const {business_id} = req.query
        logger.info(`Profit Report Summary Started for business_id: ${req.query.business_id}`);

        //waraty check
        logger.info(`waranty check`);
        logger.info(`query:SELECT cache_flag FROM profit_rpt_summary WHERE  business_id = ?.parameters:buisness_id=${business_id}`);
        const [cacheFlag] = await connection.query(
            'SELECT cache_flag FROM `profit_rpt_summary` WHERE  business_id = ?',
            [business_id]
        );

        if (cacheFlag[0].cache_flag == 1) {
           //take data from summary table
           logger.info('Fetching from input gst summary');
           logger.info(`query:SELECT ROUND(net_profit,2) AS net_profit,ROUND(net_sale,2) AS net_sale FROM profit_rpt_summary WHERE  business_id = ?`);
           logger.info(`parameters:buisness_id=${business_id}`);
           const [summaryDetails] = await connection.query(
                'SELECT ROUND(net_profit,2) AS net_profit, ROUND(net_sale,2) AS net_sale FROM `profit_rpt_summary` WHERE  business_id = ?',
                [business_id]
           );

            // Ensure at least one row is returned before accessing the value
            if (!summaryDetails.length || summaryDetails[0].net_profit === null || summaryDetails[0].net_sale === null) {
                logger.error('No details available');
                throw new Error('No details available'); 
            }

            //res
            logger.info(`response:
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Details fethced successfully",
                params: ${JSON.stringify(summaryDetails)}`)

            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Details fethced successfully",
                params: summaryDetails
            });

        }else if(cacheFlag[0].cache_flag == 0){
            //no cache action
            logger.info('Cache invalid, recalculating from source');
            logger.info(`parameters:buisness_id=${business_id}`);
            const [summaryDetails] = await connection.query(
                    `SELECT 
                        ROUND(SUM(net_sale), 2) AS net_sale,
                        ROUND(SUM(net_profit), 2) AS net_profit
                    FROM rpt_slae_profit_report
                    WHERE business_id = ?;`,
                [business_id]
            );
            logger.info(`fetched data:${JSON.stringify(summaryDetails)}`)
            // Ensure at least one row is returned before accessing the value
            if (!summaryDetails.length ||  summaryDetails[0].net_sale === null || summaryDetails[0].net_profit === null) {
                logger.error('No details available');
                throw new Error('No details available'); 
            }

            //updating cache table
            logger.info(`updating cache table`);
            const [result] = await connection.query(
                'UPDATE `profit_rpt_summary` SET net_sale = ? , net_profit = ? ,cache_flag = ? WHERE  business_id = ?;',
                [summaryDetails[0].net_sale, summaryDetails[0].net_profit ,1,business_id]
            );

            //affectedRows > 0
            if(result.affectedRows > 0){
                //res
                logger.info('Cache updated successfully');
                logger.info(`response:
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Details fethced successfully",
                    params: ${JSON.stringify(summaryDetails)}`);
                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Details fethced successfully",
                    params: summaryDetails
                });
            }else{
                logger.error('Failed to update summary table');
                throw new AppError('Failed to update summary tabel','F002');
            }

        }else{
            logger.error(`Invalid cache_flag value: ${cacheFlag[0].cache_flag}`);
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "Action not completed"
            });
        }
    }catch(err){
        logger.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F005" },
            message: err.message,
        });
    }finally{
        if (connection) connection.release();
    }
}


exports.generatePLReportExcel = async (req, res) => {
    let connection;

    try {
        const { business_id, from_date, end_date } = req.query;

        if (!business_id) {
            return res.status(400).json({
                statusDesc: "Failure",
                statusCode: { code: "F001" },
                message: "Missing business_id"
            });
        }

        connection = await pool.promise().getConnection();

        // Base condition
        const conditions = ["business_id = ?"];
        const params = [business_id];

        // Add date filter only if both dates are provided
        if (from_date && end_date) {
            conditions.push("date BETWEEN ? AND ?");
            params.push(from_date, end_date);
        }

        const whereClause = conditions.join(" AND ");

        const query = `
            SELECT 
                total_sale,
                total_sale_return,
                net_sale,
                cogs,
                cogr,
                net_cog,
                net_profit,
                margin,
                date
            FROM rpt_slae_profit_report
            WHERE ${whereClause}
            ORDER BY date DESC
        `;

        const [rows] = await connection.query(query, params);

        if (!rows.length) {
            return res.status(404).json({
                statusDesc: "Failure",
                statusCode: { code: "SC000" },
                message: "No Sale Profit Report data found",
                params: { page_data: [] }
            });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("PL Report");

        worksheet.columns = [
            { header: "Date", key: "date", width: 15 },
            { header: "Total Sale", key: "total_sale", width: 15 },
            { header: "Total Sale Return", key: "total_sale_return", width: 20 },
            { header: "Net Sale", key: "net_sale", width: 15 },
            { header: "COGS", key: "cogs", width: 15 },
            { header: "COGR", key: "cogr", width: 15 },
            { header: "Net COG", key: "net_cog", width: 15 },
            { header: "Net Profit", key: "net_profit", width: 15 },
            { header: "Margin", key: "margin", width: 10 }
        ];

        worksheet.addRows(rows);

        const filename = `pl_report_${moment().format("YYYYMMDD_HHmmss")}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

        await workbook.xlsx.write(res);
        res.status(200).end();

    } catch (err) {
        console.error("PL Excel Export Error:", err);
        res.status(500).json({
            message: "Internal Server Error"
        });
    } finally {
        if (connection) connection.release?.();
    }
};
