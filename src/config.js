import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
  isProduction: process.env.NODE_ENV === 'production'
};
