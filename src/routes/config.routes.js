import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

/**
 * GET /api/config
 * Returns only the restricted Google Maps browser key
 */
router.get('/', (req, res) => {
  res.json({
    mapsApiKey: config.googleMapsBrowserKey || ''
  });
});

export default router;
