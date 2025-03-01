require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// CORS handling - must be before other middleware
// Enable CORS for all routes and all origins
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  
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

// Google Sheets API Configuration
// You need to create a service account and share your Google Sheet with it
// Then download the credentials JSON file and set it as an environment variable
// or store it securely in your project
const GOOGLE_SHEETS_CONFIG = process.env.GOOGLE_SHEETS_CONFIG 
  ? JSON.parse(process.env.GOOGLE_SHEETS_CONFIG) 
  : {
      "type": "service_account",
      "project_id": "your-project-id",
      "private_key_id": "your-private-key-id",
      "private_key": "your-private-key",
      "client_email": "your-service-account-email",
      "client_id": "your-client-id",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_x509_cert_url": "your-cert-url"
    };

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'your-spreadsheet-id';
const SHEET_NAME = 'MealData';

// Function to authenticate with Google Sheets API
async function getGoogleSheetsAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_SHEETS_CONFIG,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// Function to append data to Google Sheet
async function appendToSheet(data) {
  try {
    const sheets = await getGoogleSheetsAuth();
    
    // Format the data for Google Sheets
    const values = [
      [
        new Date().toISOString(),
        data.imagePath || '',
        data.isComplete ? 'Yes' : 'No',
        data.nutritionalInfo?.proteins || 0,
        data.nutritionalInfo?.carbs || 0,
        data.nutritionalInfo?.fats || 0,
        data.nutritionalInfo?.calories || 0,
        data.suggestions ? data.suggestions.join(', ') : ''
      ]
    ];
    
    // Append the data to the sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:H`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error appending to Google Sheet:', error);
    throw error;
  }
}

// Function to get data from Google Sheet
async function getSheetData() {
  try {
    const sheets = await getGoogleSheetsAuth();
    
    // Get all data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:H`
    });
    
    const rows = response.data.values || [];
    
    // Skip header row and format the data
    if (rows.length <= 1) {
      return [];
    }
    
    return rows.slice(1).map((row, index) => {
      return {
        id: index,
        createdAt: row[0] || new Date().toISOString(),
        imagePath: row[1] || '',
        isComplete: row[2] === 'Yes',
        nutritionalInfo: {
          proteins: parseFloat(row[3]) || 0,
          carbs: parseFloat(row[4]) || 0,
          fats: parseFloat(row[5]) || 0,
          calories: parseFloat(row[6]) || 0
        },
        suggestions: row[7] ? row[7].split(', ') : []
      };
    });
  } catch (error) {
    console.error('Error getting data from Google Sheet:', error);
    throw error;
  }
}

// Initialize Google Sheet if it doesn't exist
async function initializeGoogleSheet() {
  try {
    const sheets = await getGoogleSheetsAuth();
    
    // Check if the sheet exists
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });
    
    const sheetExists = response.data.sheets.some(
      sheet => sheet.properties.title === SHEET_NAME
    );
    
    if (!sheetExists) {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET_NAME
                }
              }
            }
          ]
        }
      });
      
      // Add header row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:H1`,
        valueInputOption: 'RAW',
        resource: {
          values: [['Timestamp', 'ImagePath', 'IsComplete', 'Proteins', 'Carbs', 'Fats', 'Calories', 'Suggestions']]
        }
      });
      
      console.log(`Sheet "${SHEET_NAME}" created and initialized`);
    } else {
      console.log(`Sheet "${SHEET_NAME}" already exists`);
    }
  } catch (error) {
    console.error('Error initializing Google Sheet:', error);
  }
}

// Try to initialize the Google Sheet on startup
initializeGoogleSheet().catch(console.error);

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

// API routes with version
app.post('/api/v1/analyze-meal', upload.single('image'), async (req, res) => {
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
    
    // Save the image (in a real app, you'd save this to cloud storage)
    const imageName = `meal_${Date.now()}.jpg`;
    const imagePath = `/uploads/${imageName}`;
    
    // Create meal analysis record
    const mealAnalysis = {
      imagePath,
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
      ],
      createdAt: new Date().toISOString()
    };
    
    // Save to Google Sheets
    await appendToSheet(mealAnalysis);
    
    // Return the analysis
    res.json(mealAnalysis);
  } catch (error) {
    console.error('Meal analysis error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/v1/meal-history', async (req, res) => {
  try {
    // Get meal history from Google Sheets
    const mealHistory = await getSheetData();
    
    // Return the history
    res.json(mealHistory);
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
