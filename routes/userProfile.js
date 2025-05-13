// src/routes/userProfile.js

import express from 'express';
import authenticate from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getUserProfile, updateUserProfile } from '../controllers/userProfileController.js';

const router = express.Router();

// GET /api/user-profile - fetch current user's profile
router.get('/', authenticate, asyncHandler(getUserProfile));

// PUT /api/user-profile - update current user's profile
router.put('/', authenticate, asyncHandler(updateUserProfile));

export default router;
