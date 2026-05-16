// Req Module
const brevo = require("@getbrevo/brevo");

// Config
require("dotenv").config();

// Extract constructors explicitly from the modern structured package
const apiInstance = new brevo.TransactionalEmailsApi();

// Pass your API key into the configurations
apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey, 
  process.env.BREVO_API_KEY
);

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
    
    // Sender info from environment variables
    sendSmtpEmail.sender = { 
      name: "Social App", 
      email: process.env.MAIL_USER 
    };
    
    // Recipient info structured as an array of objects
    sendSmtpEmail.to = [{ email: options.to }];

    // Send request via API
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    // console.log("📧 Email sent successfully via Brevo!");
  } catch (error) {
    console.log(`[DEBUG] - SENDER SERVICE ERROR: ${error.message || error}`);
  }
};
