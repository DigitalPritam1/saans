import { Router } from 'express';
import { planBodySchema } from '../validators/schemas.js';
import { generatePlan } from '../services/gemini.js';

const router = Router();

/**
 * POST /api/plan
 * Generates structured routine adjustments, indoor hacks, and alternatives
 */
router.post('/', async (req, res, next) => {
  try {
    const validated = planBodySchema.parse(req.body);
    const plan = await generatePlan(validated);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
