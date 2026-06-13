// Import Mongoose to interact with MongoDB
import mongoose, { Connection } from 'mongoose';
import { logger } from '../utils/http/logger.js';

// Cache connection in serverless environment
let cachedConnection: Connection | null = null;

// Async function to handle the database connection
const connectDB = async (): Promise<Connection> => {
  if (cachedConnection) {
    return cachedConnection;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is missing');
  }

  try {
    // Connect using the URI from environment variables with a 5-second timeout
    cachedConnection = (await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    })).connection;

    // Log a success message with the connected host name
    logger.info(`MongoDB Connected: ${cachedConnection.host}`);
    return cachedConnection;
  } catch (error) {
    const err = error as Error;
    logger.error(`MongoDB connection error: ${err.message}`);
    throw error;
  }
};

// Export the function to be called in your main server file (e.g., server.js or index.js)
export default connectDB;