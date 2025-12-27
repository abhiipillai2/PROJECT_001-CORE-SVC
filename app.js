const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const mysql = require('mysql')
const logger = require('./utils/logger')
const userManagement = require('./router/userMnagement')
const authMiddleware  = require('./Middlewares/authMiddleware')
const businessLogic = require('./router/businessLogicRouter')
const licenes = require('./router/LicRouter')
const report = require('./router/reportServiceRouter')
require('dotenv').config()
const app = express()
const multer  = require('multer');
const path = require('path');
const PORT = process.env.PORT || 5080 //must for production environmentnpm install dotenv --save

// Serve static files from the 'Medias' folder
app.use('/Medias', express.static(path.join(__dirname, 'Medias')));

// Set up storage for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'Medias/'); // Save uploaded files to 'Medias/' directory
    },
    filename: function (req, file, cb) {
        
      // Generate a unique filename
      cb(null,file.originalname);
    }
});

// Initialize multer middleware
const upload = multer({ storage: storage });

//must use body parser for decoding the params from the url
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(upload.any());
app.use(cors())

app.use(authMiddleware);

//for master user management 
app.use(userManagement);

//for business logic
app.use(businessLogic);

//for Licence 
app.use(licenes);

//for reports
app.use(report);


app.listen(PORT, () => console.log(`checked all dependencies and core svc start on port ${PORT} successfully`));
logger.info(`printing port | port : 5080`);