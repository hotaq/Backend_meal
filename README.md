# Meal Checker Backend API

This is the backend API for the Meal Checker application, designed to be deployed on Vercel.

## Features

- User authentication (register, login)
- Meal image upload and analysis
- Meal history tracking
- MongoDB integration

## API Endpoints

- `POST /api/register` - Register a new user
- `POST /api/login` - Login a user
- `POST /api/analyze-meal` - Upload and analyze a meal image
- `GET /api/meal-history` - Get a user's meal history

## Deployment

This backend is configured for deployment on Vercel using the serverless functions approach.

### Deployment Steps

1. Install Vercel CLI:
   ```
   npm install -g vercel
   ```

2. Login to Vercel:
   ```
   vercel login
   ```

3. Deploy to Vercel:
   ```
   vercel
   ```

4. For production deployment:
   ```
   vercel --prod
   ```

## Environment Variables

Make sure to set the following environment variables in your Vercel project:

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT token generation
- `NODE_ENV` - Set to 'production' for production deployment

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file with the required environment variables.

3. Run the server:
   ```
   npm run dev
   ```

The server will be available at http://localhost:5000.

## File Storage

- In development: Files are stored locally in the `uploads` directory
- In production: Files are stored in MongoDB GridFS

## Notes

- The backend is configured to handle CORS for the frontend application
- JWT tokens are used for authentication
- Passwords are hashed using bcrypt
