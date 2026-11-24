import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './src/config.js';
import { apiRateLimiter } from './src/middleware/rateLimiter.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import aqiRouter from './src/routes/aqi.routes.js';
import planRouter from './src/routes/plan.routes.js';
import chatRouter from './src/routes/chat.routes.js';
import configRouter from './src/routes/config.routes.js';
import weatherRouter from './src/routes/weather.routes.js';
import citiesRouter from './src/routes/cities.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security headers with strict CSP tailored for Google Maps JS API
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://maps.googleapis.com',
          'https://maps.gstatic.com',
          'https://*.googleapis.com'
        ],
        connectSrc: [
          "'self'",
          'https://maps.googleapis.com',
          'https://*.googleapis.com',
          'https://*.gstatic.com'
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://maps.gstatic.com',
          'https://*.googleapis.com',
          'https://*.gstatic.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com'
        ],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Response compression
app.use(compression());

// Parse JSON request body with strict 10kb limit
app.use(express.json({ limit: '10kb' }));

// Health check endpoint for Cloud Run
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'saans-api' });
});

// Apply rate limiting to all /api routes (60 req/min per IP)
app.use('/api', apiRateLimiter);

// API routes
app.use('/api/config', configRouter);
app.use('/api/aqi', aqiRouter);
app.use('/api/plan', planRouter);
app.use('/api/chat', chatRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/cities', citiesRouter);

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA/root navigation
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central error handler (never leaks stack traces)
app.use(errorHandler);

// Start server listening on PORT only when executed directly as main script
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const PORT = config.port;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Saans] Server running on http://0.0.0.0:${PORT} in ${config.nodeEnv} mode`);
  });
}

export default app;
