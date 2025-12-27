const log4js = require("log4js");
require("dotenv").config();

log4js.configure({
    appenders: { 
        "jet-pack-core-svc": { 
            type: "file", 
            filename: process.env.LOG_PATH + (process.env.LOG_PATH.endsWith("/") ? "" : "/") + "jet-pack-core-svc.log" 
        } 
    },
    categories: { 
        default: { appenders: ["jet-pack-core-svc"], level: "debug" } 
    }
});

const logger = log4js.getLogger("jet-pack-core-svc");

module.exports = logger;