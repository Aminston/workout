// src/routes/schedule.js

import express from 'express';
import { getWeeklySchedule } from '../controllers/scheduleController.js';
import authenticate from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// GET /api/schedule - returns the weekly workout schedule for authenticated users
router.get('/schedule', authenticate, asyncHandler(getWeeklySchedule));

export default router;
