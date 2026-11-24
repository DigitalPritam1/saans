import { Router } from 'express';
import { aqiQuerySchema } from '../validators/schemas.js';
import { getAirQualityData } from '../services/airQuality.js';

const router = Router();

/**
 * GET /api/aqi?lat=&lng=
 * Returns compact AQI data, health recommendations, and 24h forecast
 */
router.get('/', async (req, res, next) => {
  try {
    const { lat, lng } = aqiQuerySchema.parse(req.query);
    const data = await getAirQualityData(lat, lng);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
