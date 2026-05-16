// Req Module
const { BrevoClient } = require("@getbrevo/brevo");

// Config
require("dotenv").config();

// Initialize the modern Brevo Client
const client = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

/**
 * Sends a transactional email using the latest Brevo API (v6+)
 * @param {Object} options - { to, subject, html, text }
 */
exports.sendMail = async function (options) {
  try {
    // Call the new transactionalEmails.sendTransacEmail method
    await client.transactionalEmails.sendTransacEmail({
      subject: options.subject,
      htmlContent: options.html || `<p>${options.text}</p>`,
      textContent: options.text,
      
      // Sender info: Make sure process.env.MAIL_USER is your Brevo login email
      sender: { 
        name: "Osak-Gram", 
        email: process.env.MAIL_USER 
      },
      
      // Recipient info
      to: [
        { email: options.to }
      ],
    });
    
    // console.log("📧 Email sent successfully via Brevo!");
  } catch (error) {
    console.log(`[DEBUG] - SENDER SERVICE ERROR: ${error.message || error}`);
  }
};
