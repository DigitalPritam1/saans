import { Router } from 'express';
import { chatBodySchema } from '../validators/schemas.js';
import { generateChatResponse } from '../services/gemini.js';

const router = Router();

/**
 * POST /api/chat
 * Answers user queries in en, hi, or mr
 */
router.post('/', async (req, res, next) => {
  try {
    const validated = chatBodySchema.parse(req.body);
    const reply = await generateChatResponse(validated);
    res.json(reply);
  } catch (err) {
    next(err);
  }
});

export default router;
