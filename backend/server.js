const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const { log } = require("console");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create necessary directories
const emailsDir = path.join(__dirname, "saved_emails");
if (!fs.existsSync(emailsDir)) {
  fs.mkdirSync(emailsDir);
  console.log("Saved emails directory created");
}

// Create email logs directory
const emailLogsDir = path.join(__dirname, "email_logs");
if (!fs.existsSync(emailLogsDir)) {
  fs.mkdirSync(emailLogsDir);
  console.log("Email logs directory created");
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(cors({
  origin: ["http://localhost:3000", "https://picapicaa.netlify.app", "https://picapicabooth.com"], 
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.static("uploads"));

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log("Uploads directory created");
}

// Email validation function
const validateEmail = (email) => {
  // Basic regex for email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return false;
  }

  if (email.includes('..')) {
    return false;
  }
  
  return true;   
};

// Create a robust email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.NOREPLY_EMAIL,
      pass: process.env.NOREPLY_EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    },
    // Add these options for better reliability
    pool: true, // Use connection pool
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5, // Limit to 5 messages per second
    // Set timeout values
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
};

// Function to log email attempts
const logEmailAttempt = (recipientEmail, success, messageId = null, errorDetails = null) => {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      recipient: recipientEmail,
      success,
      messageId,
      errorDetails: errorDetails ? JSON.stringify(errorDetails) : null
    };
    
    // Create filename based on date
    const date = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(emailLogsDir, `email_log_${date}.json`);
    
    // Append to existing file or create new one
    let logs = [];
    if (fs.existsSync(logFilePath)) {
      const fileContent = fs.readFileSync(logFilePath, 'utf8');
      logs = JSON.parse(fileContent);
    }
    
    logs.push(logEntry);
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
    
    console.log(`Email attempt logged: ${success ? 'SUCCESS' : 'FAILED'} - ${recipientEmail}`);
  } catch (err) {
    console.error("Error logging email attempt:", err);
  }
};

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); 
  },
  filename: (req, file, cb) => {
    cb(null, `photo-${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

// Upload endpoint
app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  console.log("File uploaded:", req.file.filename);
  res.json({ imageUrl: `/${req.file.filename}` });
});

// Get images endpoint
app.get("/images", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error("Error reading uploads directory:", err);
      return res.status(500).json({ message: "Error reading uploads" });
    }
    res.json(files.map(file => ({ url: `/${file}` })));
  });
});

// Send contact message endpoint
app.post("/send-message", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  console.log("Incoming message:", { name, email, message });

  const logDir = path.join(__dirname, "email_logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  const logRequest = {
    timestamp: new Date().toISOString(),
    sender: email,
    name,
    messagePreview: message.substring(0, 50) + (message.length > 50 ? "..." : "")
  };
  
  fs.writeFileSync(
    path.join(logDir, `request_${Date.now()}.json`), 
    JSON.stringify(logRequest, null, 2)
  );

  try {
    console.log("Setting up email transport for contact form...");
   
    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.CONTACT_EMAIL,
        pass: process.env.CONTACT_EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000, 
      greetingTimeout: 10000,
      socketTimeout: 15000,
      debug: true,
      logger: true
    });
    
    // Verify connection
    await transporter.verify();
    console.log("Email server is ready");

    const formattedFrom = name ? `"${name}" <${email}>` : email;
    
    const mailOptions = {
      from: formattedFrom,
      to: process.env.CONTACT_EMAIL,
      subject: `New Message from ${name}`,
      text: `Email: ${email}\n\nMessage:\n${message}`,
      replyTo: email
    };

    const sendWithRetry = async (attempts = 3, delay = 1000) => {
      try {
        return await transporter.sendMail(mailOptions);
      } catch (error) {
        if (attempts <= 1) throw error;
        console.log(`Email send failed, retrying... (${attempts-1} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return sendWithRetry(attempts - 1, delay * 1.5);
      }
    };

    const info = await sendWithRetry();
    console.log("Email sent:", info.response);
    
    // Log successful email
    const logSuccess = {
      timestamp: new Date().toISOString(),
      sender: email,
      status: "success",
      messageId: info.messageId,
      response: info.response
    };

    fs.writeFileSync(
      path.join(logDir, `success_${Date.now()}.json`), 
      JSON.stringify(logSuccess, null, 2)
    );

    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    
    // Log failed email
    const logError = {
      timestamp: new Date().toISOString(),
      sender: email,
      status: "error",
      errorCode: error.code || "unknown",
      errorMessage: error.message,
      stack: error.stack
    };
    
    fs.writeFileSync(
      path.join(logDir, `error_${Date.now()}.json`), 
      JSON.stringify(logError, null, 2)
    );

    // Save the failed message for later processing
    const failedEmail = {
      timestamp: new Date().toISOString(),
      name,
      email,
      message
    };
    
    fs.writeFileSync(
      path.join(__dirname, "saved_emails", `failed_${Date.now()}.json`), 
      JSON.stringify(failedEmail, null, 2)
    );

    res.status(500).json({ 
      message: "Failed to send email. Your message has been saved and we'll try to process it later.", 
      error: error.message 
    });
  }
});

// Send photo strip endpoint
// NOTE: This endpoint is temporarily not used by the frontend UI
// Email functionality has been disabled in favor of QR codes
app.post("/send-photo-strip", async (req, res) => {
  const { recipientEmail, imageData } = req.body;

  console.log("Attempting to send photo strip to:", recipientEmail);
  console.log("Environment variables check:", {
    hasEmail: !!process.env.NOREPLY_EMAIL,
    hasEmailPass: !!process.env.NOREPLY_EMAIL_PASS
  });
  
  // Email validation
  if (!recipientEmail || !imageData) {
    return res.status(400).json({ 
      success: false,
      message: "Missing email or image data" 
    });
  }
  
  if (!validateEmail(recipientEmail)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format"
    });
  }

  try {
    // Create transporter with improved configuration
    const transporter = createTransporter();
    
    // Verify connection
    await transporter.verify();
    console.log("Email transporter verified successfully");

    // Better handling of the image data
    let imageContent;
    try {
      const parts = imageData.split("base64,");
      if (parts.length !== 2) {
        throw new Error("Invalid image data format");
      }
      imageContent = parts[1];
    } catch (error) {
      console.error("Error processing image data:", error);
      return res.status(400).json({
        success: false,
        message: "Invalid image data format"
      });
    }

    const mailOptions = {
      from: `"Picapica Photobooth" <${process.env.NOREPLY_EMAIL}>`, // Use a friendly sender name
      to: recipientEmail,
      subject: "Your Photo Strip from Picapica 📸",
      text: "Thanks for using Picapica! Here's your photo strip. We hope you had fun!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h1 style="color: #dd88b3; text-align: center;">Your Picapica Photo Strip!</h1>
          <p style="text-align: center; font-size: 16px;">
            Thanks for using Picapica! Here's your photo strip.
          </p>
          <div style="text-align: center; margin: 20px 0;">
            <img src="cid:photostrip" alt="Photo Strip" style="max-width: 100%; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
          </div>
          <p style="font-size: 14px; text-align: center; color: #777;">
            © 2025 Agnes Wei. All Rights Reserved.
          </p>
        </div>
      `,
      attachments: [{
        filename: "photo-strip.png",
        content: imageContent,
        encoding: "base64",
        cid: "photostrip" // Referenced in the HTML above
      }]
    };

    // Add a delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    
    // Log successful email
    logEmailAttempt(recipientEmail, true, info.messageId);

    res.status(200).json({
      success: true,
      message: "Photo strip sent successfully! Please check your inbox and spam.",
      messageId: info.messageId
    });
  } catch (error) {
    console.error("Email sending error:", error);
    
    // Log failed email
    logEmailAttempt(recipientEmail, false, null, {
      code: error.code,
      message: error.message
    });
    
    // More descriptive error responses
    let errorMessage = "Failed to send email";
    let statusCode = 500;
    
    if (error.code === 'EENVELOPE') {
      errorMessage = "Invalid recipient email address";
      statusCode = 400;
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = "Connection to email server timed out";
    } else if (error.code === 'EAUTH') {
      errorMessage = "Email authentication failed. Check your credentials.";
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.toString()
    });
  }
});

const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

app.post("/generate-qr-code", async (req, res) => {
  const { imageData } = req.body;

  console.log("Generating QR code for photo sharing");
  
  if (!imageData) {
    return res.status(400).json({
      success: false,
      message: "Missing image data"
    });
  }

  try {
    const photoId = uuidv4();
    const photoDir = path.join(uploadDir, 'qr-photos');
    if (!fs.existsSync(photoDir)) {
      fs.mkdirSync(photoDir, { recursive: true });
    }
    
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const photoPath = path.join(photoDir, `${photoId}.jpg`);
    
    fs.writeFile(photoPath, base64Data, { encoding: 'base64' }, (err) => {
      if (err) console.error('Error saving image:', err);
    });
    
    // Create the URL that will be encoded in the QR code
    const photoUrl = `${req.protocol}://${req.get('host')}/photos/${photoId}`;
    
    // Generate QR code with optimized settings
    const qrCodeDataUrl = await qrcode.toDataURL(photoUrl, {
      errorCorrectionLevel: 'M', // Changed from H to M for faster generation
      margin: 1,
      width: 250, 
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    
    // Log successful QR generation
    console.log(`QR code generated successfully for photo ID: ${photoId}`);
    
    // Set up a cleanup job to delete photos after 24 hours
    setTimeout(() => {
      if (fs.existsSync(photoPath)) {
        fs.unlink(photoPath, (err) => {
          if (err) console.error(`Error deleting expired photo ${photoId}:`, err);
          else console.log(`Deleted expired photo: ${photoId}`);
        });
      }
    }, 24 * 60 * 60 * 1000);
    
    res.json({
      success: true,
      qrCodeDataUrl,
      photoUrl,
      expiresIn: '24h'
    });
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code',
      error: error.toString()
    });
  }
});

// Add this endpoint to serve the photos when scanned
app.get('/photos/:id', (req, res) => {
  const photoId = req.params.id;
  const photoPath = path.join(uploadDir, 'qr-photos', `${photoId}.jpg`);
  
  if (fs.existsSync(photoPath)) {
    // Serve the photo with a simple HTML wrapper
    const photoData = fs.readFileSync(photoPath, { encoding: 'base64' });
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Picapica Photo</title>
        <style>
          body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: radial-gradient(
              circle at center,
              rgba(255, 153, 178, 0.5) 20%,
              rgba(255, 240, 245, 0.9) 40%,
              rgba(255, 250, 250, 1) 70%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
          }
          h1 {
            color: #333;
            margin-bottom: 20px;
          }
          .photo-container {
            max-width: 100%;
            margin: 20px 0;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            border-radius: 4px;
            overflow: hidden;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
          }
          .download-btn {
            background: #afcaa6;
            color: black;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s ease;
          }
          .download-btn:hover {
            background: #91a58a;
          }
          footer {
            margin-top: 40px;
            font-size: 12px;
            color: #777;
          }
        </style>
      </head>
      <body>
        <h1>Your Picapica Photo Strip!</h1>
        <div class="photo-container">
          <img src="data:image/jpeg;base64,${photoData}" alt="Your Photo Strip" />
        </div>
        <a class="download-btn" href="data:image/jpeg;base64,${photoData}" download="picapica-photostrip.jpg">Download Photo</a>
        <footer>© 2025 Agnes Wei. All Rights Reserved.</footer>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Photo Not Found</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 40px 20px;
            background: #f8f8f8;
          }
          h1 { color: #afcaa6; }
          p { color: #555; }
        </style>
      </head>
      <body>
        <h1>Photo Not Found</h1>
        <p>This photo has expired or doesn't exist.</p>
        <p>Photos are automatically deleted after 24 hours for privacy reasons.</p>
        <p><a href="https://picapicabooth.com">Return to Picapica</a></p>
      </body>
      </html>
    `);
  }
});

// Saved emails endpoint
app.get("/saved-emails", (req, res) => {
  fs.readdir(emailsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ message: "Error reading saved emails" });
    }
    const emails = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const data = JSON.parse(fs.readFileSync(path.join(emailsDir, file)));
        return {
          filename: file,
          to: data.to,
          date: data.date
        };
      });
    res.json(emails);
  });
});


// Email stats endpoint
app.get("/email-stats", (req, res) => {
  const adminKey = req.query.key;
  
  if (adminKey !== "picapica-admin-key") {
    return res.status(401).json({ message: "Unauthorized access" });
  }
  
  try {
    const files = fs.readdirSync(emailLogsDir);
    let totalAttempts = 0;
    let successfulDeliveries = 0;
    let failedDeliveries = 0;
    let domainStats = {};
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(emailLogsDir, file), 'utf8');
          const logs = JSON.parse(content);
          
          logs.forEach(log => {
            totalAttempts++;
            
            if (log.success) {
              successfulDeliveries++;
            } else {
              failedDeliveries++;
            }
            
            // Track domain-specific stats
            try {
              const domain = log.recipient.split('@')[1];
              if (domain) {
                if (!domainStats[domain]) {
                  domainStats[domain] = { attempts: 0, success: 0, failure: 0 };
                }
                
                domainStats[domain].attempts++;
                if (log.success) {
                  domainStats[domain].success++;
                } else {
                  domainStats[domain].failure++;
                }
              }
            } catch (e) {
              console.error("Error processing domain stats:", e);
            }
          });
        } catch (error) {
          console.error(`Error reading log file ${file}:`, error);
        }
      }
    });
    
    // Calculate success rates for each domain
    Object.keys(domainStats).forEach(domain => {
      const stats = domainStats[domain];
      stats.successRate = stats.attempts > 0 
        ? (stats.success / stats.attempts * 100).toFixed(2) + "%" 
        : "0%";
    });
    
    res.json({
      totalAttempts,
      successfulDeliveries,
      failedDeliveries,
      successRate: totalAttempts > 0 ? (successfulDeliveries / totalAttempts * 100).toFixed(2) + "%" : "0%",
      domainStats
    });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving stats", error: error.message });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("Picapica Backend is running");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});