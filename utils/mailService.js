// Req Module
const brevo = require("@getbrevo/brevo");

// Config
require("dotenv").config();

// Initialize Brevo Client
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

/**
 * Sends a transactional email using Brevo API over HTTPS
 * @param {Object} options - { to, subject, html, text }
 */
exports.sendMail = async function (options) {
  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = options.subject;
    sendSmtpEmail.htmlContent = options.html || `<p>${options.text}</p>`;
    sendSmtpEmail.textContent = options.text;
    
    // Sender info: Use your name and the Gmail address you registered on Brevo with
    sendSmtpEmail.sender = { 
      name: "Osak-Gram",
      email: process.env.MAIL_USER 
    };
    
    // Recipient info
    sendSmtpEmail.to = [{ email: options.to }];

    // Send request via API
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    // console.log("📧 Email sent successfully via Brevo!", data);
  } catch (error) {
    console.log(`[DEBUG] - SENDER SERVICE ERROR: ${error.message || error}`);
  }
};
