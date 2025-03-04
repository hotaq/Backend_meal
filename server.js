require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

// Define MongoDB Schemas and Models
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const mealSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  imagePath: { type: String },
  imageBuffer: { type: Buffer },
  isComplete: { type: Boolean, default: false },
  nutritionalInfo: {
    proteins: { type: Number },
    carbs: { type: Number },
    fats: { type: Number },
    calories: { type: Number }
  },
  suggestions: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Meal = mongoose.model('Meal', mealSchema);

// Middleware
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:8000', 'http://127.0.0.1:8000', 
           'https://backend-meal-iciagr2fc-hotaqs-projects.vercel.app', 'https://backend-meal-4dj6jlz8w-hotaqs-projects.vercel.app',
           'https://backend-meal-jxb8y4xr3-hotaqs-projects.vercel.app', 'https://backend-meal-pctbnhj4i-hotaqs-projects.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));
app.use(express.json());

app.use((req,res,next)=> {
  res.header('Access-Control-Allow-Origin', '*');
  next();})
// For local development, serve static files
if (process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Add a simple root route for health check
app.get('/', (req, res) => {
  res.json({ message: 'Meal Checker API is running' });
});

// Add a simple API route for testing
app.get('/api', (req, res) => {
  res.json({ message: 'Meal Checker API is ready' });
});

// Auth middleware
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Auth routes
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const newUser = new User({
      username,
      password: hashedPassword
    });
    
    await newUser.save();
    
    // Create JWT token
    const token = jwt.sign(
      { id: newUser._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
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
      { id: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// API routes with version
app.post('/api/v1/analyze-meal', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image uploaded' });
    }
    
    // In a real app, we would analyze the image here
    // For demo purposes, we'll just return some mock data
    
    // Generate a random meal analysis
    const isComplete = Math.random() > 0.5;
    const proteins = Math.floor(Math.random() * 30) + 10;
    const carbs = Math.floor(Math.random() * 50) + 20;
    const fats = Math.floor(Math.random() * 20) + 5;
    const calories = proteins * 4 + carbs * 4 + fats * 9;
    
    // Save the image (in MongoDB)
    const imageBuffer = req.file.buffer;
    const imageName = `meal_${Date.now()}.jpg`;
    
    // Create meal analysis record
    const mealAnalysis = new Meal({
      userId: req.user.id,
      imagePath: `/uploads/${imageName}`,
      imageBuffer: imageBuffer,
      isComplete,
      nutritionalInfo: {
        proteins,
        carbs,
        fats,
        calories
      },
      suggestions: isComplete ? [] : [
        'Add more vegetables for a balanced meal',
        'Consider adding a source of lean protein',
        'Include whole grains for fiber'
      ]
    });
    
    // Save to MongoDB
    await mealAnalysis.save();
    
    // Return the analysis without the image buffer
    const responseAnalysis = mealAnalysis.toObject();
    delete responseAnalysis.imageBuffer;
    
    res.json(responseAnalysis);
  } catch (error) {
    console.error('Meal analysis error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/v1/meal-history', auth, async (req, res) => {
  try {
    // Get user's meal history from MongoDB
    const userMealHistory = await Meal.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    
    // Return the history without the image buffers
    const responseHistory = userMealHistory.map(meal => {
      const mealObj = meal.toObject();
      delete mealObj.imageBuffer;
      return mealObj;
    });
    
    res.json(responseHistory);
  } catch (error) {
    console.error('Meal history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// For serverless
module.exports = app;
