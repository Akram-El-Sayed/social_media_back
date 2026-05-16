const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const cookieParser = require('cookie-parser');
const { isDynamicOrigin } = require('./utils/corsOrigin');


const app = express();

// Connect to Database
connectDB();

const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,           
  "http://localhost:5173",          
  "http://127.0.0.1:5173",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin header)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.includes(origin) || isDynamicOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url} — origin: ${req.headers.origin}`);
  next();
});

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api', require('./routes/others')); // For notifications and reports

// Base Route
app.get('/', (req, res) => {
    res.send('API is running...');
});

module.exports = app;
