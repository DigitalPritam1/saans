import { Router } from 'express';
import { aqiQuerySchema } from '../validators/schemas.js';
import { getWeatherData } from '../services/weather.js';

const router = Router();

/**
 * GET /api/weather?lat=&lng=
 * Returns current weather conditions and inversion risk analysis
 */
router.get('/', async (req, res, next) => {
  try {
    const { lat, lng } = aqiQuerySchema.parse(req.query);
    const data = await getWeatherData(lat, lng);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
