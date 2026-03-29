const logger = require('../utils/logger')
const pool = require('../models/dataBseAdapter')
const http = require("http");
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config()
const axios = require('axios');
const jwt = require("jsonwebtoken");
const Joi = require('joi');

const PORT = process.env.PORT || 5080
const BASE_URL = process.env.BASE_URL 
const POS_URL = process.env.POS_URL
const NMS_URL = process.env.NMS_URL
const IMS_URL = process.env.IMS_URL
const MEDIA_URL = process.env.MEDIA_URL

//master and slave user registration
exports.MasterUserRegistration = async (req, res) => {
    let connection;
    try {
        logger.info("Master user registration request initiated.");
        console.log("Master user registration request initiated.");
        
        const postbusinessid = `${POS_URL}/posV1PostBusinessID`;

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const body = req.body;

        logger.info(`Request received from IP: ${clientIp}`);
        logger.info("Request body:", body);
        console.log(`Request received from IP: ${clientIp}`);
        console.log("Request body:", body);

        // Extracting fields from the request body
        const { full_name, userName, e_mail, p_word, phone_number, slave_id, role_index, realam_id, businessId } = body;

        let licenes_status = businessId !== 0 ? "ACTIVE" : "DEACTIVE";
        const freeTierFlag = 0;

        logger.info(`Posting business ID: ${businessId}, using API: ${postbusinessid}` );
        console.log(`Posting business ID: ${businessId}, using API: ${postbusinessid}` );

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for master user registration request packet:`);
        logger.info(body);
        console.log(`Request reached from host ${clientIp} for master user registration request packet:`);
        console.log(body);

        // Primary validation
        if (full_name && e_mail && p_word && phone_number && role_index && slave_id && realam_id && businessId && userName && 
            full_name !== "" && e_mail !== "" && p_word !== "" && phone_number !== "" && role_index !== "" && slave_id !== "" && 
            realam_id !== "" && userName !== "" && !isNaN(phone_number) && !isNaN(slave_id) && !isNaN(role_index)) {
            
            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Password validation
            const lengthRegex = /.{6,}/;
            const uppercaseRegex = /[A-Z]/;
            const lowercaseRegex = /[a-z]/;
            const specialCharRegex = /[^A-Za-z0-9]/;

            if (lengthRegex.test(p_word) && uppercaseRegex.test(p_word) && lowercaseRegex.test(p_word) && specialCharRegex.test(p_word)) {

                logger.info("Password validation passed.");
                console.log("Password validation passed.");

                // Phone number validation
                const phoneRegex = /^\d{10}$/;
                if (phoneRegex.test(phone_number)) {

                    logger.info("Phone number validation passed.");
                    console.log("Phone number validation passed.");

                    // Check if user already exists
                    connection = await pool.promise().getConnection();

                    logger.info("Database connection established.");
                    console.log("Database connection established.");

                    const [userRows] = await connection.query('SELECT * FROM `master-users` WHERE e_mail = ?', [e_mail]);

                    logger.info(`Fetched ${userRows.length} user(s) successfully.`);
                    logger.info(userRows);
                    console.log(`Fetched ${userRows.length} user(s) successfully.`);
                    console.log(userRows);

                    if (userRows.length >= 1) {
                        logger.error(`User already exists with email: ${e_mail}`);
                        console.error(`User already exists with email: ${e_mail}`);

                        return res.status(400).json({
                            "statusDesc": "Failure",
                            "statusCode": { "code": "F004" },
                            "message": "User already exists"
                        });
                    }

                    // Check if username is available
                    const [userNameRows] = await connection.query('SELECT * FROM `master-users` WHERE userName = ?', [userName]);

                    logger.info(`Fetched ${userNameRows.length} username(s)`);
                    logger.info(userNameRows);
                    console.log(`Fetched ${userNameRows.length} username(s)`);
                    console.log(userNameRows);

                    if (userNameRows.length >= 1) {
                        logger.error(`Username: ${userName} not available for your company`);
                        console.error(`Username: ${userName} not available for your company`);
                        return res.status(400).json({
                            "statusDesc": "Failure",
                            "statusCode": { "code": "F004" },
                            "message": "Username not available for your company"
                        });
                    }

                    // Generate business and realm ID if necessary
                    let generatedBusinessId = businessId;
                    let generatedRealmId = realam_id;

                    if (businessId == 0) {

                        const businessTred = Math.floor(Math.random() * 9000) + 1000;
                        generatedBusinessId = `${e_mail.split('@')[0]}@${businessTred}`;

                        logger.info(`Generated new business ID: ${generatedBusinessId}`);
                        console.log(`Generated new business ID: ${generatedBusinessId}`);
                        
                        //inserting barcode details.
                        //pool
                        const column = 2;
                        const left_margin = 7;
                        const top_margin = 5;
                        const horizontal_margin = 5;
                        const vertical_margin = 5;
                        const pageWidth = 95;
                        const labelWidth = 38;
                        const labelHeigth = 25;
                        
                        // Insert barcode details
                        await connection.query('INSERT INTO `bar_code_custome_deatails` (business_id,colums,left_margin,top_margin,horizontal_margin,vertical_margin,page_width,label_width,label_heigth) VALUES(?,?,?,?,?,?,?,?,?)', 
                            [generatedBusinessId,column,left_margin,top_margin,horizontal_margin,vertical_margin,pageWidth,labelWidth,labelHeigth]);

                        logger.info("Barcode details inserted");
                        console.log("Barcode details inserted");

                        await connection.query('INSERT INTO `core_job_sheet_summary_details` (tota_job_count,total_received,total_balance,cache_flag,business_id) VALUES(?,?,?,?,?)', 
                            [0,0,0,0,generatedBusinessId]);
                        
                        await connection.query('INSERT INTO `profit_rpt_summary` (net_profit,net_sale,cache_flag,business_id) VALUES(?,?,?,?)', 
                            [0,0,0,generatedBusinessId]);

                        // await connection.query(
                        //     `INSERT INTO myworks_summary_details 
                        //     (total_jobs, total_revenue, total_outstanding_balance, cache_flag, business_id, e_mail) VALUES (?, ?, ?, ?, ?, ?)`,
                        //     [0, 0, 0, 1, businessId, e_mail]
                        // );


                        logger.info(`Job summary details inserted.`);
                        console.log(`Job summary details inserted.`);

                         // Insert into core_transfer_request_sequence
                        await connection.query(`INSERT INTO core_transfer_request_sequence (sequence_value, business_id) VALUES (?, ?)`,
                            [0,generatedBusinessId]);
                        
                        logger.info(`Sequence value: 0 and business ID: ${generatedBusinessId} inserted into core_transfer_request_sequence`);
                        console.log(`Sequence value: 0 and business ID: ${generatedBusinessId} inserted into core_transfer_request_sequence`);
                        
                        // Insert into core_order_no_sequence
                        await connection.query(`INSERT INTO core_order_no_sequence (sequence_value, business_id) VALUES (?, ?)`,
                            [0,generatedBusinessId]);

                        // Insert into core_quick_order
                        await connection.query(`INSERT INTO core_work_order_seq (string_value, business_id) VALUES (?, ?)`,
                            [0,generatedBusinessId]);

                        logger.info(`Sequence value: 0 and business ID: ${generatedBusinessId} inserted into core_order_no_sequence`);
                        console.log(`Sequence value: 0 and business ID: ${generatedBusinessId} inserted into core_order_no_sequence`);

                        // Insert into user_utility_otp
                        await connection.query(
                            `INSERT INTO user_utility_otp (otp_value, status, business_id) VALUES (?, ?, ?)`, [0, 'DEACTIVATED', generatedBusinessId]
                        );

                        // Insert into core_notification_credit_master
                        await connection.query(
                            `INSERT INTO core_notification_credit_master (credit,  business_id) VALUES (?, ?)`, [5,generatedBusinessId]
                        );

                        logger.info(`Otp, status and Business ID: ${generatedBusinessId} inserted into user_utility_otp`);
                        console.log(`Otp, status and Business ID: ${generatedBusinessId} inserted into user_utility_otp`);

                        logger.info(`Calling external service to create case ID: GET ${BASE_URL}/createCaseId?business_id=${encodeURIComponent(generatedBusinessId)}`);
                        console.log(`Calling external service to create case ID: GET ${BASE_URL}/createCaseId?business_id=${encodeURIComponent(generatedBusinessId)}`);

                        await axios.get(`${BASE_URL}/createCaseId?business_id=${encodeURIComponent(generatedBusinessId)}`);

                        logger.info(`Calling core API: POST ${postbusinessid} with business_id ${generatedBusinessId}`);
                        console.log(`Calling core API: POST ${postbusinessid} with business_id ${generatedBusinessId}`);

                        //calling core for checking party
                        axios.post(postbusinessid, {
                            business_id: generatedBusinessId
                        })
                        .then(response => {
                                logger.info("Success:", response.data);
                                console.log("Success:", response.data);
                        })
                        .catch(async(error) => {
                                logger.error("Error:", error?.response?.data?.message || error.message);
                                console.error("Error:", error?.response?.data?.message || error.message);
                                try {
                                    await connection.query(
                                        'INSERT INTO `core_configuration_retry_details` (business_id, api_name, user, status, retry_count) VALUES (?, ?, ?, ?, ?)',
                                        [generatedBusinessId, 'posv1postbusinessid', e_mail, 'PENDING', 0]
                                    );
                                } catch (dbError) {
                                    logger.error("Database Insert Error:", dbError.message);
                                    console.error("Database Insert Error:", dbError.message);
                                }
                        });
                        try {
                            const { data: imsResp } = await axios.post(
                                `${IMS_URL}/imsV1CreateDefaultCategory`,
                                { businessId: generatedBusinessId }
                            );

                            logger.info(`IMS default category response: ${JSON.stringify(imsResp)}`);
                        } catch (err) {
                            logger.error(
                                `Failed to create default category in IMS for businessId=${generatedBusinessId}, err=${err.message}`
                            );
                        }

                    }

                    if (realam_id == 0) {

                        const realmTred = Math.floor(Math.random() * 9000) + 1000;
                        generatedRealmId = `${e_mail.split('@')[0]}@${realmTred}`;

                        logger.info(`Generated new realm ID: ${generatedRealmId}`);
                        console.log(`Generated new realm ID: ${generatedRealmId}`);
                    }

                    // Hash the password
                    const hashedPassword = await bcrypt.hash(p_word, 10);

                    logger.info("Password hashed");
                    console.log("Password hashed");

                    // Profile picture URL
                    const profilePic = `${MEDIA_URL}/user.png`;
                    
                    logger.info(`Profile picture URL generated: ${profilePic}`);
                    console.log(`Profile picture URL generated: ${profilePic}`);

                    //auth
                    const token = jwt.sign({ userEmail: e_mail }, process.env.JWT_SECRET);

                    logger.info(`JWT token generated for user: ${token}`);
                    console.log(`JWT token generated for user: ${token}`);

                    // Insert user into the database
                    await connection.query('INSERT INTO `master-users` (slave_id, business_id, relam_id, full_name, e_mail, password, phone_number, status, profile_pic, role_index, userName, licenes_status, free_tier_flag) VALUES (?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?)', 
                        [slave_id, generatedBusinessId, generatedRealmId, full_name, e_mail, hashedPassword, phone_number, 1, profilePic, role_index, userName, licenes_status, freeTierFlag]);

                    logger.info("New user inserted into the master-users table.");
                    console.log("New user inserted into the master-users table.");

                    // Send email notification
                    const payload = {
                        request_id: "0001",
                        to_adress: e_mail,
                        template_id: "1200",
                        subject: "Welcome to Jet Pack – Let's Get Started!",
                        params: { username: full_name }
                    };

                    try {
                        await axios.post(`${NMS_URL}/genericSendEmailNotification`, payload);

                        logger.info(`Email sent successfully using API: POST ${NMS_URL}/genericSendEmailNotification`);
                        console.log(`Email sent successfully using API: POST ${NMS_URL}/genericSendEmailNotification`);

                    } catch (emailError) {
                        logger.error("Error sending email:", emailError);
                        console.error("Error sending email:", emailError);
                    }

                    // Send meta notification notification
                    const re_id = `REQ${Date.now()}`;
                    const payloadMeta = {
                        re_id: re_id,
                        destination_phone_number: `91${phone_number}`,
                        customer_name:full_name,
                        template_id: "1011",
                        message_type: "image",
                        media_url: `${MEDIA_URL}/jet_pack_banner.jpg`,
                        params:[
                            {
                                type: "text",
                                text: full_name
                            }
                        ]
                    };

                    try {
                        await axios.post(`${NMS_URL}/nms/api/v1/sendMetaNotifications`, payloadMeta);

                        logger.info(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);
                        console.log(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);

                    } catch (metaError) {
                        logger.error("Error sending notification:", metaError);
                        console.error("Error sending notification:", metaError);
                    }

                    logger.info("User registration successful.");
                    console.log("User registration successful.");

                    // Respond with success
                    res.status(200).json({
                        "statusDesc": "Success",
                        "statusCode": { "code": "SC000" },
                        "message": "User created successfully",
                        "token" : token,
                        "param": {
                            "userEmail": e_mail,
                            "slaveId": slave_id,
                            "roleIndex": role_index,
                            "businessId": generatedBusinessId,
                            "realamId": generatedRealmId,
                            "status": 1
                        }
                    });
                    logger.info(`User created successfully for email ID: ${e_mail}, business Id: ${generatedBusinessId}`);
                    console.log(`User created successfully for email ID: ${e_mail}, business Id: ${generatedBusinessId}`);

                } else {
                    logger.error("Invalid phone number");
                    console.error("Invalid phone number");
                    return res.status(400).json({
                        "statusDesc": "Failure",
                        "statusCode": { "code": "F003" },
                        "message": "Invalid phone number"
                    });
                }
            } else {
                logger.error("Password does not meet the criteria");
                console.error("Password does not meet the criteria");
                return res.status(400).json({
                    "statusDesc": "Failure",
                    "statusCode": { "code": "F002" },
                    "message": "Password does not meet the criteria"
                });
            }
        } else {
            logger.error("Some mandatory fields are missing");
            console.error("Some mandatory fields are missing");
            return res.status(400).json({
                "statusDesc": "Failure",
                "statusCode": { "code": "F001" },
                "message": "Some mandatory fields are missing"
            });
        }
    } catch (err) {
        logger.error("Error during user registration:", err);
        console.error("Error during user registration:", err);
        res.status(500).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//realam registration
exports.realamRegistration = async (req, res) => {
    let connection;
    try {
        logger.info("Realam registration request initiated.");
        console.log("Realam registration request initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const body = req.body;

        logger.info(`Request received from IP: ${clientIp}`);
        logger.info("Request body:", body);
        console.log(`Request received from IP: ${clientIp}`);
        console.log("Request body:", body);

        const { realam_id, company_name, company_adress, pin, profile_pic, profile_pic_name,gstin ,state ,statecode,terms,qr_flag,referal_key } = body;
        // Logging request details
        logger.info(`Request reached from host ${clientIp} for realam registration and request packet:`);
        logger.info(body);
        console.log(`Request reached from host ${clientIp} for realam registration and request packet:`);
        console.log(body);

        // Primary validation
        if (realam_id && company_name && realam_id !== "" && company_name !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");
            
            // Get the file path for the profile picture
            let filePath = profile_pic_name ? `${MEDIA_URL}/${profile_pic_name}` : `${MEDIA_URL}/user.png`;
            let sealPath =  `${MEDIA_URL}/jett_pack_seal.png`;
            let terms = "No warranty for service && Confirm all accessories are submitted before leaving&&A minimum charge is required for any hardware assistance or support&&The service center is not responsible for any personal data or software loss."


            logger.info(`Profile picture URL generated: ${filePath}`);
            console.log(`Profile picture URL generated: ${filePath}`);

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            //if referal key preset
            if(referal_key){
                //checking this referal key existed or not
                const status = 'ACTIVE'
                const [referal] = await connection.query('SELECT * FROM `core_referal_masters` WHERE referal_key = ? AND status = ?', [referal_key,status]);
                logger.info(referal)

                if (referal.length === 0) {
                    logger.error(`The provided referal key is not valid or in active status ${referal_key}`);
                    console.error(`The provided referal key is not valid or in active status ${referal_key}`);

                    return res.status(400).json({
                        "statusDesc": "Failure",
                        "statusCode": { "code": "F004" },
                        "message": "The provided referal key is not valid or in active status"
                    });
                }
            }
            // Insert realam details into the database
            await connection.query('INSERT INTO `relam_master` (relam_id, compnay_name, company_address, PIN, profile_pic,seal_pic, gstin, state, state_code,terms_conditons,qr_flag,referal_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?)', 
                [realam_id, company_name, company_adress, pin, filePath, sealPath, gstin,state ,statecode,terms,'0',referal_key]);

            logger.info("Realam details inserted: ", {
                params: { realam_id, company_name, company_adress, pin, filePath, gstin,state ,statecode }
            });
            console.log("Realam details inserted: ", {
                params: { realam_id, company_name, company_adress, pin, filePath, gstin,state ,statecode }
            });

            // Respond with success
            res.status(200).json({
                "statusDesc": "Success",
                "statusCode": { "code": "SC000" },
                "message": "User realam created successfully"
            });
            logger.info("User realam created successfully");
            console.log("User realam created successfully");

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }
    } catch (err) {
        logger.error("Error during realam registration:", err);
        console.error("Error during realam registration:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//user login
exports.userLogin = async (req, res) => {
    let connection;
    try {
        logger.info("User login initiated.");
        console.log("User login initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const { e_mail, password } = req.body;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} and request packet:`);
        logger.info(req.body);
        console.log(`Request reached from host ${clientIp} and request packet:`);
        console.log(req.body);

        // Primary validation
        if (!e_mail || !password || e_mail === "" || password === "") {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

        // Get database connection
        connection = await pool.promise().getConnection();

        logger.info("Database connection established.");
        console.log("Database connection established.");

        logger.info("Checking if email exists");
        console.log("Checking if email exists");

        // Check if the email exists
        const [userRows] = await connection.query('SELECT * FROM `master-users` WHERE e_mail=?', e_mail);
        const userRowsForLog = userRows.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
        });

        logger.info(`Fetched ${userRows.length} user(s) successfully.`);
        logger.info(userRowsForLog);
        console.log(`Fetched ${userRows.length} user(s) successfully.`);
        console.log(userRowsForLog);

        if (userRows.length === 0) {
            logger.error("Entered email is not correct");
            console.error("Entered email is not correct");
            res.send({
                "statusDesc": "Failure",
                "statusCode": { "code": "F006" },
                "message": "User email is not correct"
            });

            return;
        }

        logger.info("Retrieving encrypted password for comparison");
        console.log("Retrieving encrypted password for comparison");

        // Retrieve encrypted password
        const encryptedPassword = userRows[0].password;

        logger.info("Verifying password");
        console.log("Verifying password");

        // Verify password
        const match = await bcrypt.compare(password, encryptedPassword);

        if (!match) {
            logger.error("Password entered is not correct");
            console.error("Password entered is not correct");
            res.send({
                "statusDesc": "Failure",
                "statusCode": { "code": "F007" },
                "message": "Wrong password"
            });
            return;
        }
        // Update status to 1 (logged in)
        await connection.query('UPDATE `master-users` SET status = 1 WHERE e_mail=?', e_mail);

        logger.info("User status updated to logged in");
        console.log("User status updated to logged in");

        // Retrieve user details
        const [userDetails] = await connection.query('SELECT slave_id, role_index, business_id, relam_id, e_mail, status FROM `master-users` WHERE e_mail=?', e_mail);

        logger.info("User details fetched from database");
        logger.info(userDetails);
        console.log("User details fetched from database");
        console.log(userDetails);

        const { slave_id, role_index, business_id, relam_id, status } = userDetails[0];

        const token = jwt.sign({ userEmail: e_mail }, process.env.JWT_SECRET);

        logger.info("JWT token generated for user");
        console.log("JWT token generated for user");

        // Respond with user details
        res.send({
            "statusDesc": "Success",
            "statusCode": { "code": "SC000" },
            "message": "User logged successfully",
            "token": token,
            "param": {
                "userEmail": e_mail,
                "slaveId": slave_id,
                "roleIndex": role_index,
                "businessId": business_id,
                "relamId": relam_id,
                "status": status
            }
        });
        logger.info(`User logged successfully using email ID: ${e_mail}, business Id: ${business_id}`);
        console.log(`User logged successfully using email ID: ${e_mail}, business Id: ${business_id}`);
    } catch (err) {
        logger.error("Error during user login:", err);
        console.error("Error during user login:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//user mobile login
exports.mobileUserLogin = async (req, res) => {
  let connection;
  try {
    logger.info("User login initiated.");
    console.log("User login initiated.");

    const clientIp = req.socket.remoteAddress;
    const { e_mail, password } = req.body;

    logger.info(`Request reached from host ${clientIp} and request packet:`);
    logger.info(req.body);
    console.log(`Request reached from host ${clientIp} and request packet:`);
    console.log(req.body);

    // Primary validation
    if (!e_mail || !password || e_mail === "" || password === "") {
      logger.error("Primary validation error: Some mandatory fields need to be filled");
      console.error("Primary validation error: Some mandatory fields need to be filled");
      const error = new Error("Some mandatory fields need to be filled");
      error.code = "F001";
      throw error;
    }

    connection = await pool.promise().getConnection();
    logger.info("Database connection established.");
    console.log("Database connection established.");

    // Check if the email exists
    const [userRows] = await connection.query(
      "SELECT * FROM `master-users` WHERE e_mail=?",
      [e_mail],
    );

    const userRowsForLog = userRows.map((user) => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    logger.info(`Fetched ${userRows.length} user(s) successfully.`);
    logger.info(userRowsForLog);
    console.log(`Fetched ${userRows.length} user(s) successfully.`);
    console.log(userRowsForLog);

    if (userRows.length === 0) {
      logger.error("Entered email is not correct");
      console.error("Entered email is not correct");
      return res.send({
        statusDesc: "Failure",
        statusCode: { code: "F006" },
        message: "User email is not correct",
      });
    }

    // Verify password
    const encryptedPassword = userRows[0].password;
    const match = await bcrypt.compare(password, encryptedPassword);

    if (!match) {
      logger.error("Password entered is not correct");
      console.error("Password entered is not correct");
      return res.send({
        statusDesc: "Failure",
        statusCode: { code: "F007" },
        message: "Wrong password",
      });
    }

    // Update status to logged in
    await connection.query(
      "UPDATE `master-users` SET status = 1 WHERE e_mail=?",
      [e_mail],
    );

    logger.info("User status updated to logged in");
    console.log("User status updated to logged in");

    // Retrieve user details
    const [userDetails] = await connection.query(
      "SELECT user_id, slave_id, role_index, business_id, relam_id, full_name, e_mail, status FROM `master-users` WHERE e_mail=?",
      [e_mail],
    );

    logger.info("User details fetched from database");
    console.log("User details fetched from database");

    // FIX: destructure user_id properly
    const { user_id, slave_id, role_index, business_id, relam_id, status, full_name } =
      userDetails[0];

    let direct_partner_ids = [];
    let user_type = "SUPERVISOR";

    // FIX: use user_id from userDetails, and fix duplicate role_index condition
    if (slave_id === 1) {
      const [attachedUsers] = await connection.query(
        `SELECT direct_partner_id
         FROM attached_users_list
         WHERE user_id = ?
         AND status = 'Active'`,
        [user_id],
      );

      direct_partner_ids = attachedUsers.map((row) => row.direct_partner_id);

      if (role_index === 1) {
        user_type = "SUPERVISOR";        

      } else if (role_index === 2) {
        user_type = "FARM AGENT";
             }      

    }

    const token = jwt.sign({ userEmail: e_mail }, process.env.JWT_SECRET);

    logger.info("JWT token generated for user");
    console.log("JWT token generated for user");

    return res.send({
      statusDesc: "Success",
      statusCode: { code: "SC000" },
      message: "User logged successfully",
      token: token,
      param: {
        userEmail: e_mail,
        slaveId: slave_id,
        roleIndex: role_index,
        businessId: business_id,
        relamId: relam_id,
        status: status,
        userName: full_name,
        user_type: user_type,
        direct_partner_ids: direct_partner_ids,
      },
    });

    logger.info(`User logged successfully using email ID: ${e_mail}, business Id: ${business_id}`);
    console.log(`User logged successfully using email ID: ${e_mail}, business Id: ${business_id}`);

  } catch (err) {
    logger.error("Error during user login:", err);
    console.error("Error during user login:", err);
    res.status(400).json({
      statusDesc: "Failure",
      statusCode: { code: "F005" },
      message: err.message,
    });
  } finally {
    logger.info("Releasing database connection.");
    console.log("Releasing database connection.");
    if (connection) connection.release();
    logger.info("Database connection released");
    console.log("Database connection released");
  }
};

//user mobile
exports.mobileUserStatus = async (req, res) => {
  let connection;
  try {
    logger.info("Fetching user status initiated.");
    console.log("Fetching user status initiated.");

    const clientIp = req.socket.remoteAddress;
    const { email } = req.query;
    console.log(req.query);

    logger.info(`Request reached from host ${clientIp} for getting user status and request packet:`);
    logger.info(req.query);
    console.log(`Request reached from host ${clientIp} for getting user status and request packet:`);
    console.log(req.query);

    if (email && email !== "") {
      logger.info("Primary validation passed.");
      console.log("Primary validation passed.");

      connection = await pool.promise().getConnection();
      logger.info("Database connection established.");
      console.log("Database connection established.");

      const [rows] = await connection.query(
        "SELECT user_id, e_mail, slave_id, role_index, full_name, relam_id, status, business_id FROM `master-users` WHERE e_mail=?",
        [email],
      );

      logger.info(`Fetched user status successfully.`);
      logger.info(rows);
      console.log(`Fetched user status successfully.`);
      console.log(rows);

      if (rows.length > 0) {
        const status = rows[0].status;

        let direct_partner_ids = [];
        let user_type = "SUPERVISOR";

        if (rows[0].slave_id === 1) {
          const [details] = await connection.execute(
            `SELECT direct_partner_id
             FROM attached_users_list
             WHERE user_id = ?
             AND status = 'Active'`,
            [rows[0].user_id],
          );

          direct_partner_ids = details.map((row) => row.direct_partner_id);

          if (rows[0].role_index === 1) {
            user_type = "SUPERVISOR";
          } else if (rows[0].role_index === 2) {
            // FIX: was === 1 (duplicate), now correctly === 2
            user_type = "FARM AGENT";
          }
        }

        return res.send({
          statusDesc: "Success",
          statusCode: { code: "SC000" },
          message: "User status fetched successfully",
          param: {
            ...rows[0],
            user_type: user_type,
            direct_partner_ids: direct_partner_ids,
          },
        });

        logger.info(`User status fetched successfully | ${status}`);
        console.log(`User status fetched successfully | ${status}`);

      } else {
        logger.error("User not found");
        console.error("User not found");
        return res.status(404).json({
          statusDesc: "Failure",
          statusCode: { code: "F006" },
          message: "User not found",
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
    logger.error("Error during user status retrieval:", err);
    console.error("Error during user status retrieval:", err);
    res.status(400).json({
      statusDesc: "Failure",
      statusCode: { code: "F005" },
      message: err.message,
    });
  } finally {
    logger.info("Releasing database connection.");
    console.log("Releasing database connection.");
    if (connection) connection.release();
    logger.info("Database connection released");
    console.log("Database connection released");
  }
};

//user logout
exports.userLogOut = async (req, res) => {
    let connection;
    try {
        logger.info("User logout initiated");
        console.log("User logout initiated");
        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const { e_mail } = req.body;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for logout and request packet:`);
        logger.info(req.body);
        console.log(`Request reached from host ${clientIp} for logout and request packet:`);
        console.log(req.body);

        // Primary validation
        if (e_mail && e_mail !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            // Update user status to 0 (logged out)
            await connection.query('UPDATE `master-users` SET status = 0 WHERE e_mail=?', e_mail);

            logger.info("User status updated to logged out");
            console.log("User status updated to logged out");

            // Respond with success message
            res.send({
                "statusDesc": "Success",
                "statusCode": { "code": "SC000" },
                "message": "User logged out successfully"
            });
            logger.info("User logged out successfully");
            console.log("User logged out successfully");

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during user logout:", err);
        console.error("Error during user logout:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//user status
exports.userStatus = async (req, res) => {
    let connection;
    try {
        logger.info("Fetching user status initiated.");
        console.log("Fetching user status initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request parameters
        const { email } = req.query;
        console.log(req.query);

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for getting user status and request packet:`);
        logger.info(req.query);
        console.log(`Request reached from host ${clientIp} for getting user status and request packet:`);
        console.log(req.query);

        // Primary validation
        if (email && email !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Retrieving user status");
            console.log("Retrieving user status");

            // Query to get user status
            const [rows] = await connection.query('SELECT status FROM `master-users` WHERE e_mail=?', email);

            logger.info(`Fetched user status successfully.`);
            logger.info(rows);
            console.log(`Fetched user status successfully.`);
            console.log(rows);

            if (rows.length > 0) {
                const status = rows[0].status;

                // Respond with user status
                res.send({
                    "statusDesc": "Success",
                    "statusCode": { "code": "SC000" },
                    "message": "User status fetched successfully",
                    "param": {
                        "status": status
                    }
                });
                logger.info(`User status fetched successfully | ${status}`);
                console.log(`User status fetched successfully | ${status}`);
            } else {
                logger.error("User not found");
                console.error("User not found");
                res.status(404).json({
                    "statusDesc": "Failure",
                    "statusCode": { "code": "F006" },
                    "message": "User not found"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during user status retrieval:", err);
        console.error("Error during user status retrieval:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//user details
exports.userDetails = async (req, res) => {
    let connection;
    try {
        logger.info("Fetching user details initiated.");
        console.log("Fetching user details initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request parameters
        const { email } = req.query;
        console.log(req.query);

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for getting user details and request packet:`);
        logger.info(req.query);
        console.log(`Request reached from host ${clientIp} for getting user details and request packet:`);
        console.log(req.query);

        // Primary validation
        if (email && email !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Retrieving user details");
            console.log("Retrieving user details");

            // Query to get user details
            const [rows] = await connection.query(
                "SELECT `master-users`.full_name,`master-users`.userName, `master-users`.phone_number,`master-users`.role_index,`master-users`.profile_pic AS UserProfile, relam_master.compnay_name, relam_master.company_address, relam_master.PIN, relam_master.profile_pic AS companyProfile FROM `master-users` INNER JOIN relam_master ON `master-users`.relam_id = relam_master.relam_id WHERE `master-users`.e_mail = ?", 
                email
            );

            logger.info(`Fetched user details successfully.`);
            logger.info(rows);
            console.log(`Fetched user details successfully.`);
            console.log(rows);

            if (rows.length > 0) {
                const resObj = rows[0];

                // Respond with user details
                res.send({
                    "statusDesc": "Success",
                    "statusCode": { "code": "SC000" },
                    "message": "User details fetched successfully",
                    "param": {
                        "full_name": resObj.full_name,
                        "username": resObj.userName,
                        "phoneNumber": resObj.phone_number,
                        "role_index": resObj.role_index,
                        "UserProfile": resObj.UserProfile,
                        "compnay_name": resObj.compnay_name,
                        "company_address": resObj.company_address,
                        "pin": resObj.PIN,
                        "companyProfile": resObj.companyProfile
                    }
                });
                logger.info(`User details fetched successfully | ${JSON.stringify(resObj)}`);
                console.log(`User details fetched successfully | ${JSON.stringify(resObj)}`);
            } else {
                logger.error("User not found");
                console.error("User not found");
                res.status(404).json({
                    "statusDesc": "Failure",
                    "statusCode": { "code": "F006" },
                    "message": "User not found"
                });
            }
        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during user details retrieval:", err);
        console.error("Error during user details retrieval:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//user role
exports.userRole = async (req, res) => {
    let connection;
    try {
        logger.info("Fetching user role initiated.");
        console.log("Fetching user role initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request parameters
        const { email } = req.query;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} and request packet:`);
        logger.info(req.query);
        console.log(`Request reached from host ${clientIp} and request packet:`);
        console.log(req.query);

        // Primary validation
        if (email && email !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            // Query to get role index of the user
            const [userRows] = await connection.query(
                'SELECT role_index FROM `master-users` WHERE e_mail = ?', 
                email
            );

            logger.info(`Fetched ${userRows.length} user role index successfully.`);
            logger.info(userRows);
            console.log(`Fetched ${userRows.length} user role index successfully.`);
            console.log(userRows);

            if (userRows.length > 0) {
                const role_id = userRows[0].role_index;

                logger.info(`Got role id as ${role_id}`);
                console.log(`Got role id as ${role_id}`);

                // Query to get role management details
                const [roleRows] = await connection.query(
                    'SELECT * FROM `role_management` WHERE role_id = ?', 
                    role_id
                );

                logger.info(`Fetched ${roleRows.length} user role management details successfully.`);
                logger.info(roleRows);
                console.log(`Fetched ${roleRows.length} user role management details successfully.`);
                console.log(roleRows);

                if (roleRows.length > 0) {
                    const {
                        DBVF, RPVF, WFVF, UVF, OWVF, SVF, DBEDA, DVF, INVF, RPTFLG,PFLG,TFLG,SLFLG,PUFLG,LFLG,EXFLG
                    } = roleRows[0];

                    // Respond with user role details
                    res.send({
                        "statusDesc": "Success",
                        "statusCode": { "code": "SC000" },
                        "message": "User roles fetched successfully",
                        "param": {
                            DBVF, RPVF, WFVF, UVF, OWVF, SVF, DBEDA, DVF, INVF, RPTFLG,PFLG,TFLG,SLFLG,PUFLG,LFLG,EXFLG
                        }
                    });
                    logger.info(`User role details fetched successfully | ${JSON.stringify(roleRows[0])}`);
                    console.log(`User role details fetched successfully | ${JSON.stringify(roleRows[0])}`);
                } else {
                    logger.error("Role not found for the given role id");
                    console.error("Role not found for the given role id");
                    res.status(404).json({
                        "statusDesc": "Failure",
                        "statusCode": { "code": "F006" },
                        "message": "Role not found"
                    });
                }
            } else {
                logger.error("User not found");
                console.error("User not found");
                res.status(404).json({
                    "statusDesc": "Failure",
                    "statusCode": { "code": "F006" },
                    "message": "User not found"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during user role retrieval:", err);
        console.error("Error during user role retrieval:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//update realam
exports.updateRealam = async (req, res) => {
    let connection;
    try {
        logger.info("Realam updation initiated.");
        console.log("Realam updation initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request parameters
        const { realam_id, company_name, company_add, PIN, file_name,seal_name, gstin, state, statecode, bankname, accountno, ifcode, meta_flag,terms_conditions,qr_flag } = req.body;

        const filePath = `${MEDIA_URL}/${file_name}`;
        const sealpath = `${MEDIA_URL}/${seal_name}`;

        logger.info(`Profile picture URL generated: ${filePath}`);
        console.log(`Profile picture URL generated: ${filePath}`);

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for updateRealam and request packet:`);
        logger.info(req.body);
        console.log(`Request reached from host ${clientIp} for updateRealam and request packet:`);
        console.log(req.body);

        // Primary validation
        if (realam_id && company_name && company_name !== "" && realam_id !== "" && file_name && file_name !== "" && seal_name && seal_name !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Updating realam_master table");
            console.log("Updating realam_master table");

            // Update the realam_master table
            const [result] = await connection.query(
                'UPDATE relam_master SET compnay_name = ?, company_address = ?, PIN = ?, profile_pic = ?,seal_pic = ?, gstin = ?, state = ?, state_code = ?, bank_name = ?, account_number = ?, ifc_code = ?, meta_flag = ?,terms_conditons = ?,qr_flag = ? WHERE relam_id = ?',
                [company_name, company_add, PIN, filePath,sealpath,gstin , state, statecode, bankname, accountno, ifcode, meta_flag, terms_conditions,qr_flag,realam_id ]
            );

            logger.info(result);
            console.log(result);

            if (result.affectedRows > 0) {
                res.send({
                    "statusDesc": "Success",
                    "statusCode": { "code": "SC000" },
                    "message": "Saved the changes",
                });
                logger.info(`Realam updated successfully`);
                console.log(`Realam updated successfully`);
            } else {
                logger.error("No rows affected, update failed");
                console.error("No rows affected, update failed");
                res.status(404).json({
                    "statusDesc": "Failure",
                    "statusCode": { "code": "F006" },
                    "message": "Realam not found or update failed"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during realam update:", err);
        console.error("Error during realam update:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//user get realam
exports.getRealam = async (req, res) => {
    let connection;
    try {
        logger.info("Fetching realam initiated.");
        console.log("Fetching realam initiated.");
        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request parameters
        const { realam_id } = req.query;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for getRealam and request packet:`);
        logger.info(req.query);
        console.log(`Request reached from host ${clientIp} for getRealam and request packet:`);
        console.log(req.query);

        // Primary validation
        if (realam_id && realam_id !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();
            
            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Fetching realam details");
            console.log("Fetching realam details");

            // Query to fetch realam details
            const [rows] = await connection.query(
                'SELECT compnay_name, company_address, PIN, profile_pic,seal_pic, gstin, state, bank_name, account_number, ifc_code, meta_flag,terms_conditons,qr_flag FROM relam_master WHERE relam_id = ?',
                [realam_id]
            );
            // Query to fetch messageCrdits
            const [message] = await connection.query(
                'SELECT credit FROM core_notification_credit_master WHERE business_id = (SELECT business_id FROM `master-users` WHERE relam_id = ? LIMIT 1)',
                [realam_id]
            );

            logger.info(`Fetched ${rows.length} realam detail(s) successfully.`);
            logger.info(rows);
            console.log(`Fetched ${rows.length} realam detail(s) successfully.`);
            console.log(rows);

            if (rows.length > 0) {
                res.send({
                    "statusDesc": "Success",
                    "statusCode": { "code": "SC000" },
                    "message": "Got realam details",
                    "param": rows[0],
                    "message_credit":message[0].credit
                });
                logger.info(`Got realam details`);
                console.log(`Got realam details`);
            } else {
                logger.error("No realam found for the given ID");
                console.error("No realam found for the given ID");
                res.status(404).json({
                    "statusDesc": "Failure",
                    "statusCode": { "code": "F006" },
                    "message": "No realam found for the given ID"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during fetching realam details:", err);
        console.error("Error during fetching realam details:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//reset password
exports.resetPassword = async (req, res) => {
    let connection;
    try {
        logger.info("Reset password initiated.");
        console.log("Reset password initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const { e_mail, password } = req.body;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for reset password and email ID:`);
        logger.info(e_mail);
        console.log(`Request reached from host ${clientIp} for reset password and email ID:`);
        console.log(e_mail);

        // Primary validation
        if (e_mail && password) {
            logger.info(`Primary validation and checking password criteria`);
            console.log(`Primary validation and checking password criteria`);

            // Regular expressions for password validation
            const lengthRegex = /.{6,}/;
            const uppercaseRegex = /[A-Z]/;
            const lowercaseRegex = /[a-z]/;
            const specialCharRegex = /[^A-Za-z0-9]/;

            // Perform rule validation
            if (lengthRegex.test(password) && uppercaseRegex.test(password) && lowercaseRegex.test(password) && specialCharRegex.test(password)) {

                logger.info("Password validation passed.");
                console.log("Password validation passed.");

                // Get database connection
                connection = await pool.promise().getConnection();

                logger.info("Database connection established.");
                console.log("Database connection established.");

                // Function to hash a password
                const hashPassword = async (password) => {
                    const saltRounds = 10; // Number of salt rounds (recommended value)
                    return await bcrypt.hash(password, saltRounds);
                };

                // Encrypting password
                const hashedPassword = await hashPassword(password);

                logger.info("Password hashed");
                console.log("Password hashed");

                logger.info("Updating the password.");
                console.log("Updating the password.");

                // Query to update the password
                const [rows] = await connection.query(
                    'UPDATE `master-users` SET password = ? WHERE e_mail = ?',
                    [hashedPassword, e_mail]
                );

                res.send({
                    "statusDesc": "Success",
                    "statusCode": { "code": "SC000" },
                    "message": "Password updated successfully",
                });
                logger.info("Password updated successfully");
                console.log("Password updated successfully");

            } else {
                logger.error(`Password does not meet the conditions`);
                console.error(`Password does not meet the conditions`);
                const error = new Error('Password does not meet the conditions');
                error.code = 'F002';
                throw error;
            }
        } else {
            logger.error(`Primary validation error: Some mandatory fields need to be filled`);
            console.error(`Primary validation error: Some mandatory fields need to be filled`);
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during password reset:", err);
        console.error("Error during password reset:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//master and sleve user registration
exports.contactFormSubmission = async (req, res) => {
    let connection;
    try {
        logger.info("Contact form submission initiated.");
        console.log("Contact form submission initiated.");
        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const { full_name, email, message } = req.body;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for contact form submission and request packet:`);
        logger.info(req.body);
        console.log(`Request reached from host ${clientIp} for contact form submission and request packet:`);
        console.log(req.body);

        // Primary validation
        if (full_name && email && message) {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Inserting message into contact form table");
            console.log("Inserting message into contact form table");

            // Insert message into the contact form table
            const query = 'INSERT INTO `contact_form_audit` (full_name, email, message) VALUES (?, ?, ?)';
            const [result] = await connection.query(query, [full_name, email, message]);

            logger.info("Inserting into contact_form_audit", {
                params: { full_name, email, message }
            });
            console.log("Inserting into contact_form_audit", {
                params: { full_name, email, message }
            });

            res.status(200).json({
                "statusDesc": "Success",
                "statusCode": { "code": "SC000" },
                "message": "Contact form submitted successfully"
            });

            logger.info(`Contact form inserted into table successfully`);
            console.log(`Contact form inserted into table successfully`);

        } else {
            logger.error(`Primary validation error: Some mandatory fields need to be filled`);
            console.error(`Primary validation error: Some mandatory fields need to be filled`);
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during contact form submission:", err);
        console.error("Error during contact form submission:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//get state code
exports.getStateCode = async (req, res) => {
    let connection;
    try {
        logger.info("Fetching state code initiated.");
        console.log("Fetching state code initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request parameters
        const { bsiness_id } = req.query;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for getRealam and request packet:`);
        logger.info(req.query);
        console.log(`Request reached from host ${clientIp} for getRealam and request packet:`);
        console.log(req.query);

        // Primary validation
        if (bsiness_id && bsiness_id !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Fetching realam details");
            console.log("Fetching realam details");

            // Query to fetch realam details
            const [rows] = await connection.query(
                'SELECT  compnay_name,gstin,state,state_code,company_address,PIN,profile_pic,seal_pic,bank_name,account_number,ifc_code from relam_master WHERE relam_id = (SELECT relam_id FROM `master-users` WHERE business_id = ? LIMIT 1)',
                [bsiness_id]
            );

            logger.info(`Fetched ${rows.length} realam detail(s) successfully.`);
            logger.info(rows);
            console.log(`Fetched ${rows.length} realam detail(s) successfully.`);
            console.log(rows);

            if (rows.length > 0) {
                res.send({
                    "statusDesc": "Success",
                    "statusCode": { "code": "SC000" },
                    "message": "Got realam details",
                    "param": rows[0]
                });
                logger.info(`Got realam details`);
                console.log(`Got realam details`);
            } else {
                logger.error("No realam found for the given ID");
                console.error("No realam found for the given ID");
                res.status(404).json({
                    "statusDesc": "Failure",
                    "statusCode": { "code": "F006" },
                    "message": "No realam found for the given ID"
                });
            }

        } else {
            logger.error("Primary validation error: Some mandatory fields need to be filled");
            console.error("Primary validation error: Some mandatory fields need to be filled");
            const error = new Error('Some mandatory fields need to be filled');
            error.code = 'F001';
            throw error;
        }

    } catch (err) {
        logger.error("Error during fetching realam details:", err);
        console.error("Error during fetching realam details:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//statenames
exports.statename = async (req, res) => {
    let connection;
    try {
        logger.info("Fetching statenames initiated.");
        console.log("Fetching statenames initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        logger.info(`Request reached from host ${clientIp} for fetching state details`);
        console.log(`Request reached from host ${clientIp} for fetching state details`);

        // Get database connection
        connection = await pool.promise().getConnection();

        logger.info("Database connection established.");
        console.log("Database connection established.");

        logger.info("Fetching statenames and state codes.");
        console.log("Fetching statenames and state codes.");

        // Fetch state names and codes
        const [rows] = await connection.query('SELECT state_name, state_code FROM state_master');

        logger.info(`Fetched ${rows.length} state names and codes successfully.`);
        logger.info(rows);
        console.log(`Fetched ${rows.length} state names and codes successfully.`);
        console.log(rows);

        // Send response with state data
        res.json({
            "statusDesc": "Success",
            "statusCode": { "code": "SC000" },
            "message": "State details fetched successfully",
            "data": rows
        });

        logger.info("State details successfully fetched");
        console.log("State details successfully fetched");

    } catch (err) {
        logger.error("Error fetching state details", err);
        console.error("Error fetching state details", err);
        res.status(500).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//Experience phonenumber
exports.experiencephone = async (req, res) => {
    let connection;
    try {
        logger.info("Phone number experience initiated.");
        console.log("Phone number experience initiated.");

        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id, phonenumber } = body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        logger.info(body);
        console.log(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id && phonenumber && business_id !== "" && phonenumber !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Establish database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Fetching phone number");
            console.log("Fetching phone number");

            // Query to get phone number from case_registry table
            const [rows] = await connection.query('SELECT phoe_number FROM `case_registry` WHERE phoe_number LIKE ? AND business_id = ?', [`%${phonenumber}%`, business_id]);

            logger.info(`Fetched ${rows.length} phone number(s) successfully.`);
            logger.info(rows);
            console.log(`Fetched ${rows.length} phone number(s) successfully.`);
            console.log(rows);

            if (rows.length >= 1) {
                // If phone number found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Got phone number(s) successfully",
                    param: rows
                });
                logger.info("Phone number(s) retrieved successfully");
                console.log("Phone number(s) retrieved successfully");
            } else {
                // If no matching phone number found
                logger.error("No matching phone number available");
                console.error("No matching phone number available");
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0015" },
                    message: "No matching phone number available"
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
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};
     

//removal seal
exports.removeseal = async (req, res) => {
    let connection;
    try {
        logger.info("Seal Removal request initiated.");
        console.log("Seal Removal request initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;

        // Request body
        const body = req.body;

        logger.info(`Request received from IP: ${clientIp}`);
        logger.info("Request body:", body);
        console.log(`Request received from IP: ${clientIp}`);
        console.log("Request body:", body);

        const {realam_id} = body;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for realam registration and request packet:`);
        logger.info(body);
        console.log(`Request reached from host ${clientIp} for realam registration and request packet:`);
        console.log(body);

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");
            
            // Get the file path for the profile picture
            let sealPath =  `${MEDIA_URL}/jett_pack_seal.png`;

            console.log("MEDIA_URL:", MEDIA_URL);
            console.log("Final Seal Path:", sealPath);

            logger.info(`seal picture URL generated: ${sealPath}`);
            console.log(`seal picture URL generated: ${sealPath}`);

            // Get database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            // Insert realam details into the database
            const[result] = await connection.query('UPDATE `relam_master` SET seal_pic = ? WHERE relam_id = ?', 
                [sealPath,realam_id]);
            
            console.log("Rows affected:", result.affectedRows);
            logger.info(`Rows affected: ${result.affectedRows}`);

            if (result.affectedRows === 0) {
                throw new Error("No record found for the given realam_id");
            }

            // Respond with success
            res.status(200).json({
                "statusDesc": "Success",
                "statusCode": { "code": "SC000" },
                "message": "Seal pic removed successfully",
                "sealPath": sealPath
            });
            logger.info("Seal pic removed successfully");
            console.log("Seal Pic Removed successfully");

    } catch (err) {
        logger.error("Error during removal:", err);
        console.error("Error during removal:", err);
        res.status(400).json({
            "statusDesc": "Failure",
            "statusCode": { "code": "F005" },
            "message": err.message
        });
    } finally {
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

//validate otp
exports.validateOtp = async (req, res) => {
    let connection;
    try {
        logger.info("Validating otp initiated.");
        console.log("Validating otp initiated.");

        // Client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.body;

        // Request parameters
        const { email, otp } = body;

        // Logging request details
        logger.info(`Request reached from host ${clientIp} for getting user status and request packet:`);
        console.log(`Request reached from host ${clientIp} for getting user status and request packet:`);
        logger.info(body);
        console.log(body);

        //Validate inputs
        const schema = Joi.object({
            email: Joi.string().email().required(),
            otp: Joi.string().pattern(/^\d{4}$/).required(),
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

        // Get database connection
        connection = await pool.promise().getConnection();

        logger.info("Database connection established.");
        console.log("Database connection established.");

        logger.info("Checking for OTP for the provided email");
        console.log("Checking for OTP for the provided email");

        // Query to check OTP using email id
        const [rows] = await connection.query( 'SELECT `user_utility_otp`.otp_value FROM `user_utility_otp` JOIN `master-users` ON `user_utility_otp`.business_id = `master-users`.business_id WHERE `master-users`.e_mail = ? AND `user_utility_otp`.status = "ACTIVE"', [email]);

        logger.info(`Fetched ${rows.length} OTP record(s)`);
        logger.info(rows);
        console.log(`Fetched ${rows.length} OTP record(s)`);
        console.log(rows);

        if (rows.length === 0) {
            logger.error("OTP expired or not found");
            console.error("OTP expired or not found");
            res.send({
                statusDesc: "Failure",
                statusCode: { code: "F007" },
                message: "OTP expired or not found"
            });
            return;
        }

        const storedOtp = rows[0].otp_value;

        logger.info("Comparing entered OTP with stored OTP");
        console.log("Comparing entered OTP with stored OTP");

        if (parseInt(otp) !== storedOtp) {
            logger.error("Entered OTP is incorrect");
            console.error("Entered OTP is incorrect");
            res.send({
                statusDesc: "Failure",
                statusCode: { code: "F008" },
                message: "Wrong OTP"
            });
            return;
        }

        logger.info("OTP validated successfully");
        console.log("OTP validated successfully");

        await connection.query(
            'UPDATE `user_utility_otp` SET status = "EXPIRED" WHERE otp_value = ? AND status = "ACTIVE"',
            [storedOtp]
        );

        logger.info("OTP status updated to EXPIRED.");
        console.log("OTP status updated to EXPIRED.");

        res.send({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "OTP validated successfully"
        });

    } catch (err) {
        logger.error("Error during OTP validation:", err);
        console.error("Error during OTP validation:", err);

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

exports.generateOtp = async (req, res) => {
    let connection;

    try {
        logger.info("OTP generation request initiated.");
        console.log("OTP generation request initiated.");

        const clientIp = req.socket.remoteAddress;
        const { email } = req.body;

        logger.info(`Request from IP: ${clientIp}, email: ${email}`);
        console.log(`Request from IP: ${clientIp}, email: ${email}`);


        // DB connection
        connection = await pool.promise().getConnection();
        logger.info("Database connection established.");
        console.log("Database connection established.");

        // Check if user exists
        const [userRows] = await connection.query(
            'SELECT business_id, phone_number,full_name FROM `master-users` WHERE e_mail = ?',
            [email]
        );

        if (userRows.length === 0) {
            logger.warn("User not found.");
            return res.status(404).json({
                statusDesc: "Failure",
                statusCode: { code: "F005" },
                message: "User not found."
            });
        }

        const { business_id, phone_number,full_name } = userRows[0];

        // Generate 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000);
        logger.info(`Generated OTP: ${otp} for email: ${email}`);
        console.log(`Generated OTP: ${otp} for email: ${email}`);

        // Insert into user_utility_otp
        await connection.query(
            'UPDATE user_utility_otp SET otp_value=?,status=?  WHERE business_id=?',
            [otp, 'ACTIVE', business_id]
        );
        // Send email notification
        const payload = {
            request_id: "0002",
            to_adress: email,
            template_id: "1202",
            subject: "Your Jetpack OTP Code- Complete your verification",
            params: { 
                username: full_name,
                OTP : otp

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

        // Send meta notification notification
        const re_id = `REQ${Date.now()}`;
        const payloadMeta = {
            re_id: re_id,
            destination_phone_number: `91${phone_number}`,
            customer_name:full_name,
            template_id: "1011",
            message_type: "image",
            media_url: `${MEDIA_URL}/jet_pack_banner.jpg`,
            params:[
                {
                    type: "text",
                    text: full_name
                }
                ]
            };

        try {
            await axios.post(`${NMS_URL}/nms/api/v1/sendMetaNotifications`, payloadMeta);

            logger.info(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);
            console.log(`Meta notification sent successfully using API: POST ${NMS_URL}//nms/api/v1/sendMetaNotifications`);

        } catch (metaError) {
            logger.error("Error sending notification:", metaError);
            console.error("Error sending notification:", metaError);
        }
        
        logger.info("OTP inserted into user_utility_otp.");
        console.log("OTP inserted into user_utility_otp.");

        // Respond with success (omit OTP in prod)
        res.status(200).json({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "OTP generated successfully."
        });

    } catch (err) {
        logger.error("Error during OTP generation:", err);
        console.error("Error during OTP generation:", err);

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

exports.getReamStatus = async (req, res) => {
    let connection;
    try {
        logger.info("Phone number experience initiated.");
        console.log("Phone number experience initiated.");

        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const { business_id} = body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        logger.info(body);
        console.log(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id  && business_id !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Establish database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Fetching phone number");
            console.log("Fetching phone number");

            // Query to get phone number from case_registry table
            const [rows] = await connection.query('SELECT * FROM `relam_master` WHERE relam_id = (SELECT relam_id from `master-users` WHERE slave_id = 0 AND business_id = ?)', [business_id]);

            logger.info(`Fetched ${rows.length} phone number(s) successfully.`);
            logger.info(rows);
            console.log(`Fetched ${rows.length} phone number(s) successfully.`);
            console.log(rows);

            if (rows.length >= 1) {
                // If phone number found, return the details
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Realam Existed for user",
                    param: {
                        routing_flag : false
                    }
                });
                logger.info("Phone number(s) retrieved successfully");
                console.log("Phone number(s) retrieved successfully");
            } else {
                // If no matching phone number found
                logger.error("No matching phone number available");
                console.error("No matching phone number available");
                res.send({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    message: "Realam not existed for user",
                    param: {
                        routing_flag : true
                    }
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
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};

exports.getTermsAndCondition = async (req, res) => {
    let connection;
    try {
        logger.info("Phone number experience initiated.");
        console.log("Phone number experience initiated.");

        // Get client IP
        const clientIp = req.socket.remoteAddress;
        const body = req.query;

        const {business_id} = body;

        // Logging
        logger.info(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        logger.info(body);
        console.log(`Request reached from host ${clientIp} for experience customer details and request packet:`);
        console.log(body);

        // Primary validation
        logger.info("Entering primary validation section");
        console.log("Entering primary validation section");

        if (business_id  && business_id !== "") {

            logger.info("Primary validation passed.");
            console.log("Primary validation passed.");

            // Establish database connection
            connection = await pool.promise().getConnection();

            logger.info("Database connection established.");
            console.log("Database connection established.");

            logger.info("Fetching phone number");
            console.log("Fetching phone number");

            // Query to get phone number from case_registry table
            const [rows] = await connection.query('SELECT message_footer_flag FROM `relam_master` WHERE relam_id = (SELECT relam_id from `master-users` WHERE slave_id = 0 AND business_id = ?)', [business_id]);

            logger.info(`Fetched ${rows.length} phone number(s) successfully.`);
            logger.info(rows);
            console.log(`Fetched ${rows.length} phone number(s) successfully.`);
            console.log(rows);

            if (rows[0].message_footer_flag == 1) {
                //need to get the footer message

                // Query to get terms and condition for particular realam
                const [termsAndCondition] = await connection.query('SELECT terms_conditons FROM `relam_master` WHERE relam_id = (SELECT relam_id from `master-users` WHERE slave_id = 0 AND business_id = ?)', [business_id]);

                if(termsAndCondition.length > 0){
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Terms and condition existed for user",
                        param: {
                            termsAndCondition: termsAndCondition[0],
                            footer_flag : true
                        }
                    });
                }else{
                    res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Terms and condition not existed for user",
                        param: {
                            termsAndCondition: "",
                            footer_flag : false
                        }
                    });
                }
                logger.info("Phone number(s) retrieved successfully");
                console.log("Phone number(s) retrieved successfully");
            } else {
                // If no matching phone number found
                logger.error("No matching phone number available");
                console.error("No matching phone number available");
                res.send({
                        statusDesc: "Success",
                        statusCode: { code: "SC000" },
                        message: "Terms and condition not existed for user",
                        param: {
                            termsAndCondition: "",
                            footer_flag : false
                        }
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
        logger.info("Releasing database connection.");
        console.log("Releasing database connection.");

        if (connection) connection.release(); // Ensure the connection is always released

        logger.info("Database connection released");
        console.log("Database connection released");
    }
};


exports.getMobielAppDetails = async (req, res) => {
    let connection;
    try {
        // Get client IP
        const clientIp = req.socket.remoteAddress;

        // Establish database connection
        connection = await pool.promise().getConnection();

        logger.info("Database connection established.");
        console.log("Database connection established.");

        // Query to get terms and condition for particular realam
        const [mobileAppDetails] = await connection.query('SELECT version,re_direct_url_web,re_direct_url_app FROM `core_mobile_app_details`');

        if(mobileAppDetails.length > 0){
            res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got mobile app details",
                param: mobileAppDetails[0]
            });
        }else{
            res.send({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Mobile app details not found"
            });
        }

        logger.info(`Mobile app details feteched ${mobileAppDetails[0]}`);
        console.log(`Mobile app details feteched ${mobileAppDetails[0]}`);

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