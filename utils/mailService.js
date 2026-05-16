// Req Module
const brevo = require("@getbrevo/brevo");

// Config
require("dotenv").config();

// Initialize Brevo Client cleanly using the proper modern constructor export
const apiInstance = new brevo.TransactionalEmailsApi();

// Pass your API key directly into the configuration instance
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
    
    // Sender info: Sets the display name and your registered email address securely
    sendSmtpEmail.sender = { 
      name: "Osak-Gram", 
      email: process.env.MAIL_USER 
    };
    
    // Recipient info
    sendSmtpEmail.to = [{ email: options.to }];

    // Send request via API
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    // console.log("📧 Email sent successfully via Brevo!");
  } catch (error) {
    console.log(`[DEBUG] - SENDER SERVICE ERROR: ${error.message || error}`);
  }
};
