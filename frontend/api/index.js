// Vercel serverless function handler
// This exports the Express app for use with Vercel's API routes
import app from '../server.js';

// Vercel expects the Express app to be exported directly
export default app;
