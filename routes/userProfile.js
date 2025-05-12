const express = require('express');
const authenticate = require('../middleware/auth');
const { updateUserProfile, getUserProfile } = require('../controllers/userProfileController');

const router = express.Router();

// ✅ Get current user profile
router.get('/', authenticate, getUserProfile);

// ✅ Update user profile
router.put('/', authenticate, updateUserProfile);

module.exports = router;
