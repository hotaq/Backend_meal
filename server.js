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
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://65chinnaphatck:uxClLbDgDKcUhlzG@cluster0.ikxpe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoURI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('Could not connect to MongoDB', err);
    // Continue running the app even if MongoDB connection fails
  });

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

// CORS handling - must be before other middleware
// Enable CORS for all routes and all origins
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token");
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Regular middleware
app.use(express.json());

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
  res.json({ message: 'Meal Checker API is running', status: 'ok', timestamp: new Date().toISOString() });
});

// Add a simple API route for testing
app.get('/api', (req, res) => {
  res.json({ message: 'Meal Checker API is ready' });
});

// Add a test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test endpoint is working', status: 'ok', timestamp: new Date().toISOString() });
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
