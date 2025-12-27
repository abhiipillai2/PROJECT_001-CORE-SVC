const mysql = require('mysql2');
const logger = require('../utils/logger');
require('dotenv').config();

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE,
    port: process.env.DATABASE_PORT,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DATABASE_CONNECTION, 10) || 10, // Fallback to 10 if not set
    queueLimit: 0
});

// Promisify the pool for promise-based queries
const poolPromise = pool.promise();

// Test connection
pool.getConnection((err, connection) => {
    if (err) {
        logger.debug("Database is not connected");
        logger.error(err);
    } else {
        logger.info("Database connection established successfully");
        connection.release();
    }
});

// Export the promise-based pool
module.exports = pool;
