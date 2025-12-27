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
const FILE_URL = process.env.FILE_URL;
const PAGE_ROWS = Number(process.env.GLOBAL_PAGE_ROWS);

// Use dynamic import for open package
const openPromise = import("open");

exports.jobCountWeekly = async (req, res) => {
    let connection;
    try {
        // Input validation
        const schema = Joi.object({
            business_id: Joi.string().required(),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        connection = await pool.promise().getConnection();

        const { business_id } = req.query;

        // Query to get job count for the past week
        const query = `
            SELECT DATE(date) AS transaction_date,
                   COUNT(DISTINCT case_id) AS total_cases,
                   SUM(total_bill) AS total_bill_sum,
                   SUM(balance) AS total_balance_sum
            FROM case_registry
            WHERE business_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(date)
            ORDER BY transaction_date ASC;
        `;

        const [rows] = await connection.query(query, [business_id]);

        if (rows.length > 0) {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                data: { page_data: rows },
            });
        } else {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "No data found for the provided business ID",
                params: "No Data",
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


exports.growthReport = async (req, res) => {
    let connection;
    try {
        // Input validation
        const schema = Joi.object({
            business_id: Joi.string().required(),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        connection = await pool.promise().getConnection();

        const { business_id } = req.query;

        // Query to get job count for the past week
        const query = `
            SELECT 
                YEARWEEK(date, 1) AS year_week,
                COUNT(DISTINCT case_id) AS total_cases,
                SUM(total_bill) AS total_bill_sum,
                SUM(balance) AS total_balance_sum
            FROM case_registry
            WHERE 
                business_id = ? 
                AND date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
            GROUP BY YEARWEEK(date, 1)
            ORDER BY year_week DESC
            LIMIT 2;    
        `;

        const [rows] = await connection.query(query, [business_id]);

        //calcuting growth
        if (rows.length == 2) {
            //data present
            let currentWeekBill = rows[0].total_bill_sum
            let pastWeekBill = rows[1].total_bill_sum

            // let currentWeekBill = 500
            // let pastWeekBill = 500

            let growth = ((currentWeekBill - pastWeekBill) / pastWeekBill) * 100;

            if (growth < 0) {
                //Negative
                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    data: {
                        growth_value: Math.abs(growth.toFixed(2)),
                        indicator: -1
                    },
                });
            } else if (growth > 0) {
                //positive
                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    data: {
                        growth_value: Math.abs(growth.toFixed(2)),
                        indicator: 1
                    },
                });
            } else if (growth == 0) {
                //zero
                res.status(200).json({
                    statusDesc: "Success",
                    statusCode: { code: "SC000" },
                    data: {
                        growth_value: Math.abs(growth.toFixed(2)),
                        indicator: 0
                    },
                });
            }
        } else {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                data: {
                    growth_value: 0,
                    indicator: 0
                },
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

//report
exports.revenueReport = async (req, res) => {
    let connection;
    try {
        // Input validation
        const schema = Joi.object({
            fromDate: Joi.string().optional().allow(null, ''),
            endDate: Joi.string().optional().allow(null, ''),
            exportFlag: Joi.number().integer().valid(0, 1).required(),
            business_id: Joi.string().required(),
            page_number: Joi.number().integer().min(1).default(1),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        connection = await pool.promise().getConnection();

        const { fromDate, endDate, exportFlag, business_id, page_number } = req.query;
        const count = PAGE_ROWS;

        // Base query for reusability
        let baseQuery = `
            FROM rpt_revnue
            WHERE business_id = ?
        `;
        const queryParams = [business_id];

        // Apply date filters if provided
        if (fromDate && endDate) {
            baseQuery += ' AND DATE(date) BETWEEN ? AND ?';
            queryParams.push(fromDate, endDate);
        } else if (fromDate) {
            baseQuery += ' AND DATE(date) >= ?';
            queryParams.push(fromDate);
        } else if (endDate) {
            baseQuery += ' AND DATE(date) <= ?';
            queryParams.push(endDate);
        }

        // EXPORT TO EXCEL
        if (exportFlag == 1) {
            const exportQuery = `
                SELECT DATE(date) AS transaction_date,
                       gross_revenue,
                       total_outstanding_balance,
                       number_of_cases
                ${baseQuery}
                ORDER BY date DESC
            `;

            const [rows] = await connection.query(exportQuery, queryParams);

            if (rows.length > 0) {
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Revenue Report');

                worksheet.columns = [
                    { header: 'Service Date', key: 'transaction_date' },
                    { header: 'Gross Revenue', key: 'gross_revenue' },
                    { header: 'Total Outstanding Balance', key: 'total_outstanding_balance' },
                    { header: 'Total Number of Jobs', key: 'number_of_cases' },
                ];

                worksheet.addRows(rows);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="revenue_report.xlsx"');

                await workbook.xlsx.write(res);
                logger.info('Excel file sent successfully');
            } else {
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0018" },
                    message: "No data available for export",
                });
            }

        } else {

            const paginatedQuery = `
                SELECT DATE(date) AS transaction_date,
                       gross_revenue,
                       total_outstanding_balance,
                       number_of_cases
                ${baseQuery}
                ORDER BY date DESC
                LIMIT ? OFFSET ?
            `;

            const offset = (page_number - 1) * count;
            const [rows] = await connection.query(paginatedQuery, [...queryParams, count, offset]);

            const totalQuery = `
                SELECT 
                    COALESCE(SUM(number_of_cases), 0) AS totalJobs,
                    ROUND(COALESCE(SUM(gross_revenue), 0), 2) AS totalRevenue,
                    ROUND(COALESCE(SUM(total_outstanding_balance), 0), 2) AS totalOutstandingBalance
                ${baseQuery};

            `;
            const [[recalculated]] = await connection.query(totalQuery, queryParams);

            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                data: {
                    page_data: rows,
                    param: {
                        totalJobs: recalculated.totalJobs || 0,
                        totalRevenue: recalculated.totalRevenue || 0,
                        totalOutstandingBalance: recalculated.totalOutstandingBalance || 0,
                    },
                },
            });
        }

        logger.info('Revenue report generated successfully');
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



// Employee report
exports.emplyeeReport = async (req, res) => {
    let connection;
    try {
        // Input validation
        const schema = Joi.object({
            fromDate: Joi.string().allow('', null),
            endDate: Joi.string().allow('', null),
            exportFlag: Joi.number().valid(0, 1).required(),
            business_id: Joi.string().required(),
            page_number: Joi.number().integer().min(1).default(1),
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        connection = await pool.promise().getConnection();

        const { fromDate, endDate, exportFlag, business_id, page_number } = req.query;
        const count = PAGE_ROWS;

        // Base query
        let baseQuery = `
            FROM rpt_employee_work_summary
            WHERE business_id = ?
        `;
        const queryParams = [business_id];

        // Add date filters if provided
        if (fromDate && endDate) {
            baseQuery += ' AND DATE(report_date) BETWEEN ? AND ?';
            queryParams.push(fromDate, endDate);
        } else if (fromDate) {
            baseQuery += ' AND DATE(report_date) >= ?';
            queryParams.push(fromDate);
        } else if (endDate) {
            baseQuery += ' AND DATE(report_date) <= ?';
            queryParams.push(endDate);
        }

        // Export to Excel
        if (exportFlag == 1) {
            const exportQuery = `
                SELECT DATE(report_date) AS transaction_date,
                       engineer_name,
                       total_job,
                       total_completed,
                       total_pending,
                       gross_amount,
                       total_outstanding
                ${baseQuery}
                ORDER BY report_date DESC
            `;

            const [rows] = await connection.query(exportQuery, queryParams);

            if (rows.length > 0) {
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Employee Report');

                worksheet.columns = [
                    { header: 'Service Date', key: 'transaction_date' },
                    { header: 'Engineer Name', key: 'engineer_name' },
                    { header: 'Total Job', key: 'total_job' },
                    { header: 'Total Completed', key: 'total_completed' },
                    { header: 'Total Pending', key: 'total_pending' },
                    { header: 'Gross Amount', key: 'gross_amount' },
                    { header: 'Total Outstanding', key: 'total_outstanding' },
                ];

                worksheet.addRows(rows);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="employee_report.xlsx"');

                await workbook.xlsx.write(res);
                logger.info('Excel file sent successfully');
            } else {
                res.status(200).json({
                    statusDesc: "Failure",
                    statusCode: { code: "F0018" },
                    message: "No data available for export",
                });
            }

        } else {
            const dataQuery = `
                SELECT DATE(report_date) AS transaction_date,
                       engineer_name,
                       total_job,
                       total_completed,
                       total_pending,
                       gross_amount,
                       total_outstanding
                ${baseQuery}
                ORDER BY report_date DESC
                LIMIT ? OFFSET ?
            `;
            const [rows] = await connection.query(dataQuery, [...queryParams, count, (page_number - 1) * count]);

            const totalQuery = `
                SELECT 
                    COALESCE(SUM(total_job), 0) AS totalJobs,
                    ROUND(COALESCE(SUM(gross_amount), 0), 2) AS totalRevenue,
                    ROUND(COALESCE(SUM(total_outstanding), 0), 2) AS totalOutstandingBalance
                ${baseQuery};

            `;
            const [[recalculated]] = await connection.query(totalQuery, queryParams);

            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                data: {
                    page_data: rows,
                    param: {
                        totalJobs: recalculated.totalJobs || 0,
                        totalRevenue: recalculated.totalRevenue || 0,
                        totalOutstandingBalance: recalculated.totalOutstandingBalance || 0,
                    },
                },
            });
        }
        logger.info('Employee report generated successfully');
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

//create Events
exports.createEvents = async (req, res) => {
    let connection;
    try {
        // Input validation
        const schema = Joi.object({
            status: Joi.string().required(),
            asset_status:Joi.string().required(),
            flag: Joi.number().integer().valid(0, 1).required(),
            assigne: Joi.string().required(),
            case_id: Joi.number().integer().required(),
            total_amount:Joi.number().integer().required(),
            recived_amount:Joi.number().integer().required(),
            businessId: Joi.string().required(),
            action_owner: Joi.string().required(),
        });


        const { error } = schema.validate(req.body);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        const { status, flag, assigne, case_id: caseId, businessId: businessId, action_owner,asset_status,total_amount,recived_amount } = req.body;
        const currentTimestamp = moment().format('YYYY-MM-DD HH:mm:ss');

        connection = await pool.promise().getConnection();

        await connection.beginTransaction();

        if (flag === 0) {
            await connection.query(
                'INSERT INTO `work_flow_case_status` (event, status, CASE_ID, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                ["Status Changed to", status, caseId, currentTimestamp, businessId, action_owner]
            );
            await connection.query(
                'INSERT INTO `work_flow_case_status` (event, status, CASE_ID, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                ["Asset Status Changed to", asset_status, caseId, currentTimestamp, businessId, action_owner]
            );
            await connection.query(
                'INSERT INTO `work_flow_assigne_details` (event, assignee, CASE_ID, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                ["Case Assigned to", assigne, caseId, currentTimestamp, businessId, action_owner]
            );
            await connection.query(
                'INSERT INTO `core_work_flow_payment_track` (event, amount, case_id, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                ["Total Amount Added", total_amount, caseId, currentTimestamp, businessId, action_owner]
            );
            await connection.query(
                'INSERT INTO `core_work_flow_payment_track` (event, amount, case_id, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                ["Received Amount Added", recived_amount, caseId, currentTimestamp, businessId, action_owner]
            );
        } else {

            //Checking job status and asset status
            const [[lastStatus]] = await connection.query(
                'SELECT status FROM `work_flow_case_status` WHERE business_id = ? AND CASE_ID = ? AND event = "Status Changed to" ORDER BY event_date DESC LIMIT 1',
                [businessId, caseId]
            );
            const [[lastAssetStatus]] = await connection.query(
                'SELECT status FROM `work_flow_case_status` WHERE business_id = ? AND CASE_ID = ? AND event = "Asset Status Changed to" ORDER BY event_date DESC LIMIT 1',
                [businessId, caseId]
            );

            //Asset status
            if (lastAssetStatus?.status !== asset_status) {
                await connection.query(
                    'INSERT INTO `work_flow_case_status` (event, status, CASE_ID, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                    ["Asset Status Changed to", asset_status, caseId, currentTimestamp, businessId, action_owner]
                );
            }
            //job status
            if (lastStatus?.status !== status) {
                await connection.query(
                    'INSERT INTO `work_flow_case_status` (event, status, CASE_ID, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                    ["Status Changed to", status, caseId, currentTimestamp, businessId, action_owner]
                );
            }
            //checking assigne details
            const [[lastAssignee]] = await connection.query(
                'SELECT assignee FROM `work_flow_assigne_details` WHERE business_id = ? AND CASE_ID = ? ORDER BY event_date DESC LIMIT 1',
                [businessId, caseId]
            );
            if (lastAssignee?.assignee !== assigne) {
                await connection.query(
                    'INSERT INTO `work_flow_assigne_details` (event, assignee, CASE_ID, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                    ["Case Assigned to", assigne, caseId, currentTimestamp, businessId, action_owner]
                );
            }
            //Total payment tarcking
            const [[lastPaymentTotal]] = await connection.query(
                'SELECT amount FROM `core_work_flow_payment_track` WHERE business_id = ? AND case_id = ? AND event ="Total Amount Added" ORDER BY event_date DESC LIMIT 1',
                [businessId, caseId]
            );
            if (lastPaymentTotal?.amount > total_amount || lastPaymentTotal?.amount < total_amount) {
                await connection.query(
                    'INSERT INTO `core_work_flow_payment_track` (event, amount, case_id, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                    ["Total Amount Added", total_amount, caseId, currentTimestamp, businessId, action_owner]
                );
            }

            //recived Amount tarcking
            const [[lastPaymentRecived]] = await connection.query(
                'SELECT amount FROM `core_work_flow_payment_track` WHERE business_id = ? AND case_id = ? AND event ="Received Amount Added" ORDER BY event_date DESC LIMIT 1',
                [businessId, caseId]
            );
            if (lastPaymentRecived?.amount > recived_amount || lastPaymentRecived?.amount < recived_amount) {
                await connection.query(
                    'INSERT INTO `core_work_flow_payment_track` (event, amount, case_id, event_date, business_id, action_owner) VALUES (?, ?, ?, ?, ?, ?)',
                    ["Received Amount Added", recived_amount, caseId, currentTimestamp, businessId, action_owner]
                );
            }
        }

        await connection.commit();

        res.status(200).json({
            statusDesc: "Success",
            statusCode: { code: "SC000" },
            message: "Event processed successfully",
        });
    } catch (err) {
        if (connection) await connection.rollback();
        logger.error(`Error processing request: ${err.message}`);
        res.status(500).json({
            statusDesc: "Failure",
            statusCode: { code: "F001" },
            message: err.message
        });
    } finally {
        if (connection) connection.release();
    }
};

//employee report
exports.GetLifeCycle = async (req, res) => {
    let connection;
    try {
        // Input validation
        const schema = Joi.object({
            case_id: Joi.number().integer().required(),
            business_id: Joi.string().required()
        });

        const { error } = schema.validate(req.query);
        if (error) throw new Error(`Validation Error: ${error.details[0].message}`);

        connection = await pool.promise().getConnection();

        const { business_id, case_id: caseId,} = req.query;
        
        const query = `
            SELECT event, detail, case_id, event_date, action_owner
            FROM (
                SELECT 
                    wfa.event AS event, 
                    wfa.assignee AS detail, 
                    wfa.CASE_ID AS case_id, 
                    wfa.event_date AS event_date, 
                    wfa.action_owner AS action_owner
                FROM work_flow_assigne_details AS wfa
                WHERE wfa.business_id = ? AND wfa.CASE_ID = ?

                UNION ALL

                SELECT 
                    wfd.event AS event, 
                    wfd.status AS detail, 
                    wfd.CASE_ID AS case_id, 
                    wfd.event_date AS event_date, 
                    wfd.action_owner AS action_owner
                FROM work_flow_case_status AS wfd
                WHERE wfd.business_id = ? AND wfd.CASE_ID = ?

                UNION ALL

                SELECT 
                    cpt.event AS event, 
                    CONCAT('INR ', cpt.amount) AS detail, 
                    cpt.case_id AS case_id, 
                    cpt.event_date AS event_date, 
                    cpt.action_owner AS action_owner
                FROM core_work_flow_payment_track AS cpt
                WHERE cpt.business_id = ? AND cpt.case_id = ?
            ) AS u
            ORDER BY u.event_date ASC;
        `;

        const [rows] = await connection.query(query, [business_id, caseId, business_id, caseId, business_id, caseId]);

        if (rows.length > 0) {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC000" },
                message: "Got all works successfully",
                params: rows,
            });
            logger.info("Got case life cycle successfully");
        } else {
            res.status(200).json({
                statusDesc: "Success",
                statusCode: { code: "SC001" },
                message: "No case life cycle available for this case id",
                params: "No Data",
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
