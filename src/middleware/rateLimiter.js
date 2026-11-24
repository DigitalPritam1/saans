import rateLimit from 'express-rate-limit';

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60, // Limit each IP to 60 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests from this IP, please try again after a minute.'
  }
});
