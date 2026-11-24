import { Router } from 'express';
import { getMetroCitiesAqi } from '../services/cities.js';

const router = Router();

/**
 * GET /api/cities
 * Returns current AQI snapshot for top 8 Indian metro cities
 */
router.get('/', async (req, res, next) => {
  try {
    const cities = await getMetroCitiesAqi();
    res.json({ cities });
  } catch (err) {
    next(err);
  }
});

export default router;
