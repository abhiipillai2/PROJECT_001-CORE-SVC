const path = require("path");
const os = require("os");

const logger = require("../utils/logger");
const generatePDF = require("../utils/pdf_generator");
const queryBulder = require("../utils/filterQueryGenerator");
const pool = require("../models/dataBseAdapter");
const Instamojo = require("instamojo-payment-nodejs");
const http = require("http");
const bcrypt = require("bcrypt");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const moment = require("moment");
const axios = require('axios');
const Joi = require('joi');

require("dotenv").config();
const PORT = process.env.PORT || 5080;
const BASE_URL = process.env.BASE_URL;
const NMS_URL = process.env.NMS_URL
const FILE_URL = process.env.FILE_URL;
const PAGE_ROWS = Number(process.env.GLOBAL_PAGE_ROWS);
const MEDIA_URL = process.env.MEDIA_URL

// Use dynamic import for open package
const openPromise = import("open");

exports.purchaseLicense = async (req, res) => {
  let connection;
  try {
    // Client IP
    const clientIp = req.socket.remoteAddress;
    const { business_id, package_code, amount, isReccuring } = req.body;

    // Logging request details
    logger.info(`Request reached from host ${clientIp} for purchase license and request packet:`);
    logger.info(req.body);
    console.log(req.body)
    
    // Primary validation
    logger.info(`Request entering for primary validation check`);
    if (business_id && package_code && amount) {
      //checking this is a payment for message pack or not
      if(isReccuring == 1){
        //message pack recharge
        //checkiong minum amouy case
        if(amount >= 10){
          // Paid package logic with 3rd party payment call
          const API_KEY = process.env.API_KEY;
          const AUTH_KEY = process.env.AUTH_KEY;

          // Setup Instamojo
          Instamojo.setKeys(API_KEY, AUTH_KEY);

          // Fetch user data from master-users table
          connection = await pool.promise().getConnection();
          const [userData] = await connection.query('SELECT full_name, e_mail, phone_number FROM `master-users` WHERE business_id = ?', [business_id]);

          if (userData.length > 0) {
            const { full_name, e_mail, phone_number } = userData[0];

            // Fetch package details from package_description table
            const [packageData] = await connection.query('SELECT package_name, selling_price FROM `package_description` WHERE package_code = ?', [package_code]);

            if (packageData.length > 0) {
              const { package_name, selling_price } = packageData[0];

              // Generate callback URL
              const callBackUrl = `${BASE_URL}/createLicense?business_id=${encodeURIComponent(business_id)}&package_code=${encodeURIComponent(package_code)}&full_name=${encodeURIComponent(full_name)}&e_mail=${encodeURIComponent(e_mail)}&phone_number=${phone_number}&amount=${amount}`;

              logger.info(`Request reached for ${package_name} with amount ${selling_price} for business id ${business_id}`);
              logger.info(`The 3rd party payment URL is ${callBackUrl}`);

              // Payment data for Instamojo
              const options = {
                purpose: package_name,
                amount: amount,
                currency: 'INR',
                buyer_name: full_name,
                email: e_mail,
                phone: phone_number,
                send_email: false,
                send_sms: false,
                allow_repeated_payments: false,
                redirect_url: callBackUrl
              };

              // Create payment request via Instamojo
              const paymentData = Instamojo.PaymentData(options);
              const response = await Instamojo.createNewPaymentRequest(paymentData);

              logger.info(`Generated the payment URL: ${response.payment_request.longurl}`);

              res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                paymetUrl: response.payment_request.longurl
              });
              logger.info(`Payment URL sent to the client`);
              } else {
                throw new Error("Package details not found");
              }
            } else {
              throw new Error("User data not found");
            }
        }else{
          throw new Error("Minimum 10 RS requred");
        }
      }else{
        //Normal payment for PKGS
        if (amount == "0") {
          // Free trial package logic
          logger.info(`License creation for free trial package`);
          connection = await pool.promise().getConnection();

          // Fetch the period from the package_description table
          const [rows] = await connection.query('SELECT period FROM `package_description` WHERE package_code = ?', [package_code]);
          if (rows.length > 0) {
            const periods = rows[0].period;
            const currentTimestamp = moment();
            const startDate = currentTimestamp.format('YYYY-MM-DD HH:mm:ss');
            const endDate = currentTimestamp.add(periods, 'days').format('YYYY-MM-DD HH:mm:ss');
            const status = 'ACTIVE';
            logger.info(`Package start date is ${startDate} and the end date is ${endDate}`);

            // Create free tier license
            logger.info(`Creating free tier license for the business id ${business_id}`);
            await connection.query('UPDATE `master-users` SET licenes_status = "ACTIVE", free_tier_flag = "1" WHERE business_id = ?', [business_id]);
            
            // Insert into license_master table
            await connection.query('INSERT INTO `license_master` (package_code, start_date, exr_date, status, business_id) VALUES (?, ?, ?, ?, ?)', [package_code, startDate, endDate, status, business_id]);

            res.status(200).json({
              statusDesc: "Success",
              statusCode: { code: "SC000" },
              message: "License purchased successfully"
            });
            logger.info(`Free tier license created successfully for business id ${business_id}`);
          } else {
            throw new Error("Package not found");
          }
      } else {
        // Paid package logic with 3rd party payment call
        const API_KEY = process.env.API_KEY;
        const AUTH_KEY = process.env.AUTH_KEY;

        // Setup Instamojo
        Instamojo.setKeys(API_KEY, AUTH_KEY);

        // Fetch user data from master-users table
        connection = await pool.promise().getConnection();
        const [userData] = await connection.query('SELECT full_name, e_mail, phone_number FROM `master-users` WHERE business_id = ?', [business_id]);

        if (userData.length > 0) {
          const { full_name, e_mail, phone_number } = userData[0];

          // Fetch package details from package_description table
          const [packageData] = await connection.query('SELECT package_name, selling_price FROM `package_description` WHERE package_code = ?', [package_code]);

          if (packageData.length > 0) {
            const { package_name, selling_price } = packageData[0];

            // Generate callback URL
            const callBackUrl = `${BASE_URL}/createLicense?business_id=${encodeURIComponent(business_id)}&package_code=${encodeURIComponent(package_code)}&full_name=${encodeURIComponent(full_name)}&e_mail=${encodeURIComponent(e_mail)}&phone_number=${phone_number}&amount=${selling_price}`;

            logger.info(`Request reached for ${package_name} with amount ${selling_price} for business id ${business_id}`);
            logger.info(`The 3rd party payment URL is ${callBackUrl}`);

            // Payment data for Instamojo
            const options = {
              purpose: package_name,
              amount: selling_price,
              currency: 'INR',
              buyer_name: full_name,
              email: e_mail,
              phone: phone_number,
              send_email: false,
              send_sms: false,
              allow_repeated_payments: false,
              redirect_url: callBackUrl
            };

            // Create payment request via Instamojo
            const paymentData = Instamojo.PaymentData(options);
            const response = await Instamojo.createNewPaymentRequest(paymentData);

            logger.info(`Generated the payment URL: ${response.payment_request.longurl}`);

            res.status(200).json({
              statusDesc: "Success",
              statusCode: { code: "SC000" },
              paymetUrl: response.payment_request.longurl
            });
            logger.info(`Payment URL sent to the client`);
          } else {
            throw new Error("Package details not found");
          }
        } else {
          throw new Error("User data not found");
        }
      }
    }
    } else {
      throw new Error("Some mandatory fields need to be filled");
    }
  } catch (err) {
    logger.error(err);
    res.status(400).json({
      statusDesc: "Failure",
      statusCode: err.code || "F005",
      message: err.message
    });
  } finally {
    if (connection) connection.release(); // Ensure connection is released
  }
};

//creating license
exports.licCreateLicense = async (req, res) => {
  let connection;
  try {
    // Client IP
    const clientIp = req.socket.remoteAddress;
    const { business_id, full_name, e_mail, phone_number,package_code, payment_id, payment_status, payment_request_id,amount } = req.query;

    logger.info(`Got callback from ${clientIp} for creating license`);

    // Inserting transaction into table
    connection = await pool.promise().getConnection();
    await connection.query(
      "INSERT INTO `transaction_master` (business_id, package_code,amount, payment_id, payment_status, payment_request_id) VALUES (?, ?, ?, ?, ?,?)",
      [business_id, package_code,amount, payment_id, payment_status, payment_request_id]
    );
    logger.info(`Transaction inserted`);

    // Payment checking and routing
    if (payment_status === "Credit") {

      //cheking is this is a message recharge
      if(package_code == "JPLIC003"){
        logger.info("Creating purchase for message pack")
        //checking user level
        const [rows] = await connection.query('SELECT package_code FROM `license_master` WHERE business_id = ? AND status = "ACTIVE"', [business_id]);
        const [messageChargeDetails] = await connection.query('SELECT jet_slab_1_charge,jet_slab_2_charge,3pp_charge AS commision,meta_charge FROM `core_notification_charges_configs`', []);
        let credit = 0
        if(rows[0].package_code === "JPLIC001"){
          logger.info("Free user")
          const perMessageCost = (messageChargeDetails[0].jet_slab_1_charge  + messageChargeDetails[0].commision + messageChargeDetails[0].meta_charge)

          logger.info("Calculating credits")
          credit =(amount / perMessageCost);

        }else{
          logger.info("Plus user")
          const perMessageCost = (messageChargeDetails[0].jet_slab_2_charge  + messageChargeDetails[0].commision + messageChargeDetails[0].meta_charge)

          logger.info("Calculating credits")
          credit =(amount / perMessageCost);
        }

        logger.info("Updating with new credits")
        logger.info(`Executing query: UPDATE core_notification_credit_master SET credit = credit + ? WHERE business_id = ?`);

        const [updateResult] = await connection.query(
            'UPDATE core_notification_credit_master SET credit = credit + ? WHERE business_id = ?',
            [credit,business_id]
        );
        if (updateResult.affectedRows > 0) {
            // Redirecting to thank you page
            res.redirect(`${FILE_URL.trim()}/thankyou/index.html`);
        } else {
            logger.error(`Payment failed for business id ${business_id}`);
            res.redirect(`${FILE_URL.trim()}/sometingWentWrong/index.html`);
        }
      }else{
        //suscribtion entry
        // --------- BEGIN TRANSACTION for license changes ----------
        await connection.beginTransaction();
        // Fetching package details and creating license
        const [packageData] = await connection.query(
          "SELECT period, package_name, selling_price FROM `package_description` WHERE package_code = ?",
          [package_code]
        );

        if (packageData.length > 0) {
          const { period, package_name, selling_price } = packageData[0];

          // Calculating start and end dates
          const currentTimestamp = moment();

          // assume: currentTimestamp is a moment() object
          const now = currentTimestamp.clone();

          // Start Date
          const startDate = now.format("YYYY-MM-DD HH:mm:ss");
          
          // Carry-over from existing plan (if any)
          let carryoverDays = 0;

          //check the user is paying early 
          const [existingPackageDetails] = await connection.query(
            "SELECT exr_date FROM `license_master` WHERE status = 'ACTIVE' AND business_id = ?",
            [business_id]
          );

          if (existingPackageDetails?.length > 0 && existingPackageDetails[0]?.exr_date) {

            const expiry = moment(existingPackageDetails[0].exr_date, "YYYY-MM-DD HH:mm:ss", true);

            if (expiry.isValid()) {
              carryoverDays = Math.max(0, expiry.diff(now, "days"));
            }
          }

          // Total period = new period + remaining days from current plan
          const totalDays = period + carryoverDays;

          // Final end date (clone again to avoid mutating `now`)
          const endDate = now.clone().add(totalDays, "days").format("YYYY-MM-DD HH:mm:ss");
          const status = "ACTIVE";
          
          logger.info(`The start date of package ${package_code} is ${startDate} and the end date is ${endDate}`);

          // Updating user table and inserting into license_master table
          await connection.query(
            'UPDATE `master-users` SET licenes_status = "ACTIVE", remainder_flag = 0 WHERE business_id = ?',
            [business_id]
          );

          // Deactivating old plans
          await connection.query(
            'UPDATE `license_master` SET status = "DEACTIVE" WHERE status = "ACTIVE" AND business_id = ?',
            [business_id]
          );

          //ADDING NEW PLANS
          await connection.query(
            "INSERT INTO `license_master` (package_code, start_date, exr_date, status, business_id) VALUES (?, ?, ?, ?, ?)",
            [package_code, startDate, endDate, status, business_id]
          );

          // 4) COMMIT the license transaction
          await connection.commit();
          
          logger.info(`License created successfully for business id ${business_id}`);

          // Sending email notification
          const payload = {
            request_id: "0001",
            to_adress: e_mail,
            template_id: "1201",
            subject: "Your Jet Pack Subscription is Confirmed – Package Details Inside",
            params: {
              username: full_name,
              package_name,
              price: selling_price,
              start_date: startDate,
              end_date: endDate
            }
          };

          try {
            await axios.post(`${NMS_URL}/genericSendEmailNotification`, payload);
            logger.info('Email sent successfully');
          } catch (emailError) {
            logger.error('Error sending email:', emailError);
          }

          //sending meta notification
          const re_id = `REQ${Date.now()}`;
          const payloadMeta = {
            re_id: re_id,
            destination_phone_number: `91${phone_number}`,
            customer_name:full_name,
            template_id: "1012",
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

          // Redirecting to thank you page
          res.redirect(`${FILE_URL.trim()}/thankyou/index.html`);
        } else {
          throw new Error("Package not found");
        }
      }
    } else {
      logger.error(`Payment failed for business id ${business_id}`);
      res.redirect(`${FILE_URL.trim()}/sometingWentWrong/index.html`);
    }
  } catch (err) {

    // Rollback only if we had started a TX on this connection
    try {

      if (connection) await connection.rollback();

    } catch (rbErr) {

      logger.error("Rollback failed:", rbErr);
      
    }

    logger.error(err);
    res.status(400).json({
      statusDesc: "Failure",
      statusCode: err.code || "F005",
      message: err.message
    });
  } finally {
    if (connection) connection.release(); // Ensure connection is released
  }
};

//get all palns
exports.licGetAllPlans = async (req, res) => {
  let connection;
  try {
    // Client IP
    const clientIp = req.socket.remoteAddress;
    const { business_id } = req.query;

    logger.info(`Request from ${clientIp} to get all plans`);

    // Checking if the user has used the free trial or not
    connection = await pool.promise().getConnection();
    const [userRows] = await connection.query(
      "SELECT free_tier_flag FROM `master-users` WHERE business_id = ?",
      [business_id]
    );

    if (userRows.length > 0) {
      const freeTierFlag = userRows[0].free_tier_flag;

      let packageQuery = "";
      if (freeTierFlag === 0) {
        // New user, hasn't used the free trial yet
        packageQuery = "SELECT package_name, package_code, price, selling_price FROM `package_description`";
      } else if (freeTierFlag === 1) {
        // User has already used the free trial
        packageQuery = 'SELECT package_name, package_code, price, selling_price FROM `package_description` WHERE selling_price != "0"';
      }

      // Fetching the packages based on freeTierFlag
      const [packageRows] = await connection.query(packageQuery);

      if (packageRows.length > 0) {
        const resObj = packageRows;

        res.send({
          statusDesc: "Success",
          statusCode: {
            code: "SC000",
          },
          message: "Got all packages",
          param: {
            page_data: resObj,
          },
        });

        logger.info(`Got all plan details`);
      } else {
        throw new Error("No packages found");
      }
    } else {
      throw new Error("User not found");
    }
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      statusDesc: "Failure",
      statusCode: {
        code: "F005",
      },
      message: err.message,
    });
  } finally {
    if (connection) connection.release(); // Ensure connection is released
  }
};

//get user status on licesne
exports.licGetStatus = async (req, res) => {
  let connection;
  try {
    // Client IP
    const clientIp = req.socket.remoteAddress;
    const { business_id } = req.query;

    logger.info(`Request from ${clientIp} to get license status`);

    // Get connection from the pool
    connection = await pool.promise().getConnection();

    // Fetch license status for the given business_id
    const [userRows] = await connection.query(
      "SELECT licenes_status,remainder_flag FROM `master-users` WHERE business_id = ?",
      [business_id]
    );

    if (userRows.length === 0) {
      throw new Error("User not found");
    }

    const status = userRows[0].licenes_status;

    // Fetch license details for the given business_id
    const [licenseRows] = await connection.query(
      'SELECT package_code, start_date, exr_date FROM `license_master` WHERE status = "ACTIVE" AND business_id = ?',
      [business_id]
    );

    if (licenseRows.length === 0) {
      return res.status(200).json({
        statusDesc: "Success",
        statusCode: {
          code: "SC000",
        },
        message: "User has no active subscription",
        status : 'DEACTIVE',
        package_code: "P001"
      });
    }

    const { package_code, start_date, exr_date } = licenseRows[0];

    // Fetch package name using the package_code
    const [packageRows] = await connection.query(
      "SELECT package_name FROM `package_description` WHERE package_code = ?",
      [package_code]
    );

    if (packageRows.length === 0) {
      throw new Error("Package not found");
    }

    const package_name = packageRows[0].package_name;

    // Send the response with the user license status and package details
    res.status(200).json({
      statusDesc: "Success",
      statusCode: {
        code: "SC000",
      },
      message: "Got user license status",
      status,
      package_code,
      packageName: package_name,
      startDate: start_date,
      endDate: exr_date,
      remainder_flag : userRows[0].remainder_flag
    });

    logger.info(`Successfully fetched license status for business_id: ${business_id}`);
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      statusDesc: "Failure",
      statusCode: {
        code: "F005",
      },
      message: err.message,
    });
  } finally {
    if (connection) connection.release(); // Ensure connection is released
  }
};

//get plan based access
exports.licGetPlanBasedAccess = async (req, res) => {
  let connection;
  try {
    // Client IP
    const clientIp = req.socket.remoteAddress;
    const { package_code } = req.query;

    logger.info(`Request from ${clientIp} to get package-based access`);

    // Get connection from the pool
    connection = await pool.promise().getConnection();

    // Fetch package access details for the given package_code
    const [rows] = await connection.query(
      "SELECT service_flag, inventory_flag FROM `package_access_master` WHERE package_code = ?",
      [package_code]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        statusDesc: "Failure",
        statusCode: {
          code: "F001",
        },
        message: "Package code not found",
      });
    }

    // Send the response with the package access details
    res.status(200).json({
      statusDesc: "Success",
      statusCode: {
        code: "SC000",
      },
      message: "Got all package-based access",
      param: {
        page_data: rows,
      },
    });

    logger.info(`Successfully fetched package access for package_code: ${package_code}`);
  } catch (err) {
    logger.error(err);
    res.status(500).json({
      statusDesc: "Failure",
      statusCode: {
        code: "F005",
      },
      message: err.message,
    });
  } finally {
    if (connection) connection.release(); // Ensure connection is released
  }
};

//get all palns
exports.getPlanFromCode = async (req, res) => {
  let connection;
  try {
    // Client IP
    const clientIp = req.socket.remoteAddress;
    //input validation
    const schema = Joi.object({
      pkg_code: Joi.string().required()
    });
    //getting connetion
    logger.info("getting database connection");
    console.log("getting database connection");
    connection = await pool.promise().getConnection();
    logger.info("database connection established");
    console.log("database connection established");

    const { error } = schema.validate(req.query);
    if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

    const {pkg_code} = req.query

    // Fetch package access details for the given package_code
    const [rows] = await connection.query(
      "SELECT package_name, selling_price,period FROM `package_description` WHERE package_code = ?",
      [pkg_code]
    );

    if(rows.length > 0){
      res.status(200).json({
        statusDesc: "Success",
        statusCode: { code: "SC000" },
        message: "Details fethced successfully",
        params: rows
      });
    }else{

      throw new Error('No package is available');
      
    }

  } catch (err) {
    logger.error(err);
    res.status(500).json({
      statusDesc: "Failure",
      statusCode: {
        code: "F005",
      },
      message: err.message,
    });
  } finally {
    if (connection) connection.release(); // Ensure connection is released
  }
};