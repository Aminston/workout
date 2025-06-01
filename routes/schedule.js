import express from 'express';
import {
  getWeeklySchedule,
  updateWorkoutModification,
  resetWorkoutModification
} from '../controllers/scheduleController.js';

import authenticate from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /schedule
 * Returns the weekly workout plan with user modifications.
 * (This is the root route when mounted as /schedule in app.js)
 */
router.get('/', authenticate, asyncHandler(getWeeklySchedule));

/**
 * POST /schedule/workout/update
 * Updates sets, reps, or weight for a specific workout.
 */
router.patch('/workout/update', authenticate, asyncHandler(updateWorkoutModification));

/**
 * POST /schedule/workout/reset
 * Resets user modifications to original workout values.
 */
router.post('/workout/reset', authenticate, asyncHandler(resetWorkoutModification));

export default router;
