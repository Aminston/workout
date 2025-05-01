// routes/userProfile.js
const express = require('express');
const {
  createUserProfile,
  getUserProfile,
  updateUserProfile
} = require('../controllers/userProfileController');

const router = express.Router();

// Create new profile
router.post('/user-profile', createUserProfile);

// Fetch profile
router.get('/user-profile/:userId', getUserProfile);

// Update profile
router.put('/user-profile/:userId', updateUserProfile);

module.exports = router;
