require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:8000', 'http://localhost:5000', 'https://webcheck-frontend.vercel.app'],
  credentials: true
}));
app.use(express.json());

// For local development, serve static files
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, 'uploads')));
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Storage configuration for Vercel (in-memory for serverless)
let storage;

// Check if running on Vercel (production)
if (process.env.VERCEL) {
  // For Vercel, we'll use MongoDB GridFS for file storage
  const { GridFsStorage } = require('multer-gridfs-storage');
  
  // Create GridFS storage engine
  storage = new GridFsStorage({
    url: process.env.MONGODB_URI,
    options: { useNewUrlParser: true, useUnifiedTopology: true },
    file: (req, file) => {
      return {
        filename: `${Date.now()}-${file.originalname}`,
        bucketName: 'uploads'
      };
    }
  });
} else {
  // For local development, use disk storage
  // Create upload directory if it doesn't exist
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }
  
  storage = multer.diskStorage({
    destination: function(req, file, cb) {
      cb(null, path.join(__dirname, 'uploads'));
    },
    filename: function(req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  });
}

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function(req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Define User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Define Meal Analysis Schema
const mealAnalysisSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  imagePath: { type: String, required: true },
  status: { type: String, enum: ['complete', 'incomplete'], required: true },
  message: { type: String, required: true },
  nutrition: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number,
    fiber: Number
  },
  suggestions: [String],
  createdAt: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', userSchema);
const MealAnalysis = mongoose.model('MealAnalysis', mealAnalysisSchema);

// Routes

// Register new user
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const user = new User({
      username,
      password: hashedPassword
    });
    
    await user.save();
    
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware to verify JWT token
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Upload and analyze meal
app.post('/api/analyze-meal', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }
    
    // In a real app, you would analyze the image here
    // For this demo, we'll simulate the analysis
    const isComplete = Math.random() > 0.5;
    
    let analysis;
    if (isComplete) {
      analysis = {
        userId: req.user.id,
        imagePath: req.file.path,
        status: 'complete',
        message: 'Your meal appears to be nutritionally balanced with a good mix of proteins, carbohydrates, and vegetables.',
        nutrition: {
          calories: Math.floor(Math.random() * 300) + 500,
          protein: Math.floor(Math.random() * 20) + 20,
          carbs: Math.floor(Math.random() * 30) + 40,
          fat: Math.floor(Math.random() * 15) + 15,
          fiber: Math.floor(Math.random() * 5) + 5
        },
        suggestions: []
      };
    } else {
      analysis = {
        userId: req.user.id,
        imagePath: req.file.path,
        status: 'incomplete',
        message: 'Your meal appears to be missing some key nutritional components.',
        nutrition: {
          calories: Math.floor(Math.random() * 200) + 300,
          protein: Math.floor(Math.random() * 10) + 10,
          carbs: Math.floor(Math.random() * 20) + 30,
          fat: Math.floor(Math.random() * 10) + 5,
          fiber: Math.floor(Math.random() * 3) + 2
        },
        suggestions: [
          'Add a source of lean protein like chicken, fish, or tofu',
          'Include more vegetables for fiber and micronutrients',
          'Consider adding a whole grain for complex carbohydrates',
          'Add a small portion of healthy fats like avocado or nuts'
        ]
      };
    }
    
    const mealAnalysis = new MealAnalysis(analysis);
    await mealAnalysis.save();
    
    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's meal history
app.get('/api/meal-history', auth, async (req, res) => {
  try {
    const mealHistory = await MealAnalysis.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json(mealHistory);
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Root route for health check
app.get('/', (req, res) => {
  res.json({ message: 'Meal Checker API is running' });
});

// Start server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel serverless deployment
module.exports = app;
