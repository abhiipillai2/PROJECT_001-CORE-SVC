const fs = require("fs");
const puppeteer = require('puppeteer');
const logger = require("../utils/logger");

const os = require("os");
const path = require('path');
const ejs = require("ejs");
const { execFile } = require('child_process');
const isArm = os.arch().startsWith('arm');
const platform = os.platform();
require("dotenv").config();

const PYTHON_ENV_PATH = process.env.PYTHON_ENV_PATH;
let executablePath;

if (platform === 'linux' && isArm) 
    {

  executablePath = '/snap/bin/chromium'; // ARM Linux prod

} else if (platform === 'linux') {

  executablePath = path.join(
    os.homedir(),
    '.cache/puppeteer/chrome/linux-123.0.6312.58/chrome-linux64/chrome'
  ); // Dev EC2 Linux
} else if (platform === 'win32') {

    executablePath = undefined; // Let Puppeteer use bundled Chromium on Windows
}


// async function generatePDF(data) {
//     // HTML template with dynamic placeholders
//     const htmlTemplate = `<!DOCTYPE html>
//       <html lang="en">
//       <head>
//         <meta charset="UTF-8">
//         <meta name="viewport" content="width=device-width, initial-scale=1.0">
//         <title>Service Record</title>
//         <style>
//           /* @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;700&display=swap'); */

//           @font-face {
//             font-family: 'Poppins';
//             src: url('<<POPPINS_REGULAR>>') format('truetype');
//             font-weight: 400;
//           }

//           @font-face {
//             font-family: 'Poppins';
//             src: url('<<POPPINS_MEDIUM>>') format('truetype');
//             font-weight: 500;
//           }

//           @font-face {
//             font-family: 'Poppins';
//             src: url('<<POPPINS_BOLD>>') format('truetype');
//             font-weight: 700;
//           }
//           body {
//             font-family: 'Poppins', sans-serif;
//             margin: 0;
//             padding: 0;
//           }

//           #header, #body-part, #footer {
//             margin: 20px;
//           }

//           #header {
//             display: flex;
//             justify-content: space-between;
//             align-items: center;
//             border-bottom: 2px solid #f58220;
//             padding-bottom: 10px;
//           }

//           .logo img {
//             width: 100px;
//             height: 100px;
//           }

//           table {
//             width: 100%;
//             border-collapse: collapse;
//             margin-top: 10px;
//           }

//           th, td {
//             border: 1px solid #080606;
//             padding: 8px;
//             text-align: left;
//             font-size: 12px;
//           }

//           th {
//             background-color: #f0f0f0;
//           }

//           .payment-details {
//             margin-top: 20px;
//           }

//           .payment-table {
//             margin-bottom: 20px;
//           }

//           .square-box {
//             width: 100px;
//             height: 100px;
//             border: 2px solid black;
//           }
          
//           #footer {
//             font-size: 12px;
//             color: #333;
//             padding: 20px;
//             border-top: 2px solid #f58220;
//           }

//           #footer p {
//             margin: 5px 0;
//             line-height: 1.5;
//           }

//           #terms p {
//             margin: 2px 0;
//             font-size: 11px;
//           }

//           #company-address {
//             text-align: center;
//             font-size: 12px;
//             color: #555;
//           }

//           #company-address p {
//             margin: 5px 0;
//           }
//         </style>
//       </head>
//       <body>
//         <!-- Main Container -->
//         <div id="mainContaier">
//           <!-- Header -->
//           <div id="header">
//             <div> 
//               <h2>SERVICE RECORD</h2>
//               <div style="display: flex;padding: 5px;border-radius: 10px;border: 1px solid #ccc;
//             background-color: #f9f9f9;font-size: 12px;">
//                 <div>
//                   <p> <strong>Date:</strong></p>
//                   <p><strong>Case ID:</strong></p>
//                 </div>
//                 <div>
//                   <p>${new Date(data.date).toLocaleDateString()}</p>
//                   <p>${data.caseId}</p>
//                 </div>
//               </div>
//             </div>
//             <div class="logo" style="text-align: center;">
//               <img src="${data.companyLogo}" alt="Company Logo">
//               <h3>${data.companyName}</h3>
//             </div>
//           </div>

//           <!-- Body Part -->
//           <div id="body-part">
//             <p>Dear Sir/Madam,</p>
//             <div style="border: 1px solid #f58220; padding: 20px;">
//               <!-- Customer Details -->
//               <div style="font-size: 12px;">
//                 <strong>Customer Details</strong>
//                 <p>Customer Name: ${data.customerName}</p>
//                 <p>Customer Email: ${data.customerEmail}</p>
//                 <p>Customer Phone: ${data.customerPhone}</p>
//               </div>
//             </div>

//             <!-- Service Details -->
//             <div class="serive-details">
//               <p>Asset Details</p>
//               <table>
//                 <tr>
//                   <th>S.No</th>
//                   <th>Product Name</th>
//                   <th>Manufacturer</th>
//                   <th>Model</th>
//                   <th>Serial Number</th>
//                   <th>Problem Description</th>
//                   <th>Auxiliary Equipment</th>
//                 </tr>
//                 <tr>
//                   <td>${data.itemNo}</td>
//                   <td>${data.item}</td>
//                   <td>${data.brand}</td>
//                   <td>${data.model}</td>
//                   <td>${data.serialNumber}</td>
//                   <td>${data.problemDescription}</td>
//                   <td>${data.auxiliaryEquipment}</td>
//                 </tr>
//               </table>
//             </div>

//             <!-- Payment Details -->
//             <div class="payment-details">
//               <table>
//                 <tr>
//                   <th>Total Amount</th>
//                   <td>${data.estimateAmount}</td>
//                 </tr>
//                 <tr>
//                   <th>Advance Amount</th>
//                   <td>${data.advancedPayment}</td>
//                 </tr>
//                 <tr>
//                   <th>Balance Amount</th>
//                   <td>${data.balance}</td>
//                 </tr>
//               </table>
//             </div>
//           </div>

//           <!-- Footer -->
//           <div id="footer">
//             <p>Thank you for choosing us.</p>
//             <div id="terms">
//               <strong>Terms and Conditions:</strong>
//               <p>1. No warranty for service.</p>
//               <p>2. Confirm all accessories are submitted before leaving.</p>
//               <p>3. A minimum charge is required for any hardware assistance or support.</p>
//               <p>4. The service center is not responsible for any personal data or software loss.</p>
//             </div>
//             <hr>
//             <div id="company-address" style="max-width: 500px;margin-left: 12%;">
//               <p><strong>${data.companyName}</strong></p>
//               <p>${data.adress}</p>
//               <p>PIN: ${data.pin}</p>
//             </div>
//           </div>
//         </div>
//       </body>
//       </html>`

//      let browser;
//   try {

//     const fontDir = path.resolve(__dirname, '../utils/localFonts');
//     logger.info("Rendering Local Fonts from system diredtory");
//     const fontPaths = {
//       POPPINS_REGULAR: `file://${path.join(fontDir, 'Poppins-Regular.ttf').replace(/\\/g, '/')}`,
//       POPPINS_MEDIUM: `file://${path.join(fontDir, 'Poppins-Medium.ttf').replace(/\\/g, '/')}`,
//       POPPINS_BOLD: `file://${path.join(fontDir, 'Poppins-Bold.ttf').replace(/\\/g, '/')}`
//     };

//     let templateWithFonts = htmlTemplate;
//     for (const [key, fileUrl] of Object.entries(fontPaths)) {
//       templateWithFonts = templateWithFonts.replace(new RegExp(`<<${key}>>`, 'g'), fileUrl);
//     }

//     browser = await puppeteer.launch({
//       headless: 'new', // Stable headless mode
//         // executablePath: isArm ? '/snap/bin/chromium' : undefined,
//         executablePath,
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--disable-dev-shm-usage', // reduce memory issues
//             '--disable-accelerated-2d-canvas',
//             '--no-zygote',
//             '--disable-gpu'
//           ],
//           timeout: 60000, // 60 sec timeouts
//           protocolTimeout: 120000 // 2 minutes for DevTools commands
//     });

//     const page = await browser.newPage();
    
//     await page.setContent(templateWithFonts, { waitUntil: 'networkidle0', timeout: 60000 });

//     const pdfBuffer = await page.pdf({
//       format: 'A4',
//       margin: { top: '.2in', right: '.1in', bottom: '.1in', left: '.1in' },
//       timeout: 60000,
//     });

//     const pdfPath = `summary_receipt_${data.caseId}.pdf`;
//     await fs.writeFile(pdfPath, pdfBuffer);

//     return pdfPath;

//   } catch (error) {
//     console.error(" Error generating PDF:", error.message);
//     logger.error(" Error generating PDF:", error.message);
//     throw new Error("PDF generation failed: " + error.message);

//   } finally {
//     if (browser) {
//       try {
//         await browser.close();
//       } catch (closeError) {
//         console.error("Error closing Puppeteer browser:", closeError.message);
//         logger.error("Error closing Puppeteer browser:", closeError.message);
//       }
//     }
//   }
// }

async function generatePDF(data) {
  let tempHtmlPath, outputPdfPath;
  const qrRow = (data.upi_id && data.upi_id !== '0' && parseInt(data.qr_flag) === 1 && data.QR_URL)
    ? `<tr>
         <th>Payment QR</th>
         <td>
           <img src="${data.QR_URL}" style="width:60px;height:60px;"><br>
           ${data.payee_name}(${data.upi_id})
         </td>
       </tr>`
    : '';
  const htmlTemplate = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Service Record</title>
        <style>

          /* Malayalam fallback */
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam&display=swap');

          body {
            font-family: 'Noto Sans Malayalam'
          }

          #terms p {
            font-family: 'Noto Sans Malayalam'
            margin: 2px 0;
            font-size: 11px;
          }

          #header, #body-part, #footer {
            margin: 20px;
          }

          #header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #f58220;
            padding-bottom: 10px;
          }

          .logo img {
            width: 100px;
            height: 100px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }

          th, td {
            border: 1px solid #080606;
            padding: 8px;
            text-align: left;
            font-size: 12px;
          }

          th {
            background-color: #f0f0f0;
          }

          .payment-details {
            margin-top: 20px;
          }

          .payment-table {
            margin-bottom: 20px;
          }

          .square-box {
            width: 100px;
            height: 100px;
            border: 2px solid black;
          }
          
          #footer {
            font-size: 12px;
            color: #333;
            padding: 20px;
            border-top: 2px solid #f58220;
          }

          #footer p {
            margin: 5px 0;
            line-height: 1.5;
          }

          #terms p {
            margin: 2px 0;
            font-size: 11px;
          }

          #company-address {
            text-align: center;
            font-size: 12px;
            color: #555;
          }

          #company-address p {
            margin: 5px 0;
          }
        </style>
      </head>
      <body>
        <!-- Main Container -->
        <div id="mainContaier">
          <!-- Header -->
          <div id="header">
            <div> 
              <h2>SERVICE REPORT</h2>
              <div style="display: flex;padding: 5px;border-radius: 10px;border: 1px solid #ccc;
            background-color: #f9f9f9;font-size: 12px;">
                <div>
                  <p> <strong>Date:</strong></p>
                  <p><strong>Case ID:</strong></p>
                </div>
                <div>
                  <p>${new Date(data.date).toLocaleDateString()}</p>
                  <p>${data.caseId}</p>
                </div>
              </div>
            </div>
            <div class="logo" style="text-align: center;">
              <img src="${data.companyLogo}" alt="Company Logo">
              <h3>${data.companyName}</h3>
            </div>
          </div>

          <!-- Body Part -->
          <div id="body-part">
            <p>Dear Sir/Madam,</p>
            <div style="border: 1px solid #f58220; padding: 20px;">
              <!-- Customer Details -->
              <div style="font-size: 12px;">
                <strong>Customer Details</strong>
                <p>Customer Name: ${data.customerName}</p>
                <p>Customer Email: ${data.customerEmail}</p>
                <p>Customer Phone: ${data.customerPhone}</p>
                <p>Customer Address: ${data.billingAddress}</p>
              </div>
            </div>

            <!-- Service Details -->
            <div class="serive-details">
              <p>Asset Details:</p>
              <table>
                <tr>
                  <th>Product Name</th>
                  <th>Manufacturer</th>
                  <th>Model</th>
                  <th>Serial Number</th>
                  <th>Problem Description</th>
                  <th>Auxiliary Equipment</th>
                  <th>Work Status</th>
                  <th>Asset Status</th>
                  <th>Repair Remarks</th>
                </tr>
                <tr>
                  <td>${data.item}</td>
                  <td>${data.brand}</td>
                  <td>${data.model}</td>
                  <td>${data.serialNumber}</td>
                  <td>${data.problemDescription}</td>
                  <td>${data.auxiliaryEquipment}</td>
                  <td>${data.status}</td>
                  <td>${data.case_status}</td>
                  <td>${data.comments}</td>
                </tr>
              </table>
            </div>

            <!-- Payment Details -->
            <div class="payment-details">
              <p>Payment Estimate:</p>
              <table>
                <tr>
                  <th>Total Amount</th>
                  <td>${data.estimateAmount}</td>
                </tr>
                <tr>
                  <th>Advance Amount</th>
                  <td>${data.advancedPayment}</td>
                </tr>
                <tr>
                  <th>Balance Amount</th>
                  <td>${data.balance}</td>
                </tr>
                ${qrRow}
              </table>
            </div>
          </div>

          <!-- Footer -->
          <div id="footer">
            <p>Thank you for choosing us.</p>
            <div id="terms">
              <strong>Terms and Conditions:</strong>
                ${data.terms.map(term => `<p>${term}</p>`).join('')}
            </div>
            <hr>
            <div id="company-address" style="max-width: 500px;margin-left: 12%;">
              <p><strong>${data.companyName}</strong></p>
              <p>${data.adress}</p>
              <p>PIN: ${data.pin}</p>
            </div>
          </div>
        </div>
      </body>
      </html>`

  try {
    // Load and render EJS template
    // const htmlTemplate = fs.readFileSync(path.join(__dirname, 'service_record_template.ejs'), 'utf-8');
    const renderedHtml = await ejs.render(htmlTemplate, data);

    // Create temp HTML and PDF paths
    tempHtmlPath = path.join(__dirname, `temp_invoice_${data.caseId}.html`);
    outputPdfPath = path.join(__dirname, `summary_receipt_${data.caseId}.pdf`);
    fs.writeFileSync(tempHtmlPath, renderedHtml, 'utf-8');

    // Fonts
    const fontDir = path.resolve(__dirname, '../utils/localFonts');
    const poppinsRegular = path.join(fontDir, 'Poppins-Regular.ttf').toString();
    const poppinsMedium = path.join(fontDir, 'Poppins-Medium.ttf').toString();
    const poppinsBold = path.join(fontDir, 'Poppins-Bold.ttf').toString();


    // Python script
    const scriptPath = path.join(__dirname, 'generate_pdf.py').toString();

    // Execute Python script
    await new Promise((resolve, reject) => {
      execFile(
        PYTHON_ENV_PATH,
        [scriptPath, tempHtmlPath, outputPdfPath, poppinsRegular, poppinsMedium, poppinsBold],
        (error, stdout, stderr) => {
          if (error) {
            logger.error('PDF generation failed:', stderr);
            return reject(new Error(stderr));
          }
          logger.info(`Python PDF generation completed: ${outputPdfPath}`);
          resolve();
        }
      );
    });

    //  Return the path instead of buffer
    return outputPdfPath;

  } catch (err) {
    logger.error('Error generating PDF:', err.message);
    throw err;

  } finally {
    // Optionally clean up the temp HTML file only
    try {
      if (tempHtmlPath && fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
      //  Keep the PDF if you're returning its path — remove this line if cleanup is not desired
      // if (outputPdfPath && fs.existsSync(outputPdfPath)) fs.unlinkSync(outputPdfPath);
    } catch (cleanupErr) {
      logger.warn('Failed to cleanup temp files:', cleanupErr.message);
    }
  }
}

module.exports = generatePDF;
