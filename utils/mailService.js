// Req Module
const nodemailer = require("nodemailer");

// Config
require("dotenv").config();

// Transporter
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// transporter.verify(function (error, success) {
//   if (error) {
//     console.log("Transporter verify error:", error);
//   } else {
//     console.log("Mail server is ready:", success);
//   }
// });

/**
 * 
 * @param {*} options 
 * options: {
     to, 
     subject,
     html,
     text
 }
 */
exports.sendMail = async function (options) {
  try {
    await transporter.sendMail({ from: process.env.MAIL_USER, ...options });
  } catch (error) {
    console.log(`[DEBUG] - SENDER SERVICE ERROR: ${error}`);
  }
};
