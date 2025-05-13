// src/routes/ai.js

import express from 'express';
import authenticate from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  personalizePlan,
  resetPersonalizedPlan
} from '../controllers/openaiController.js';

const router = express.Router();

// POST /api/personalize/plan - generate a personalized workout plan
router.post(
  '/plan',
  authenticate,
  asyncHandler(personalizePlan)
);

// DELETE /api/personalize/reset - reset the personalized plan
router.delete(
  '/reset',
  authenticate,
  asyncHandler(resetPersonalizedPlan)
);

export default router;