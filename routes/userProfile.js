// routes/userProfile.js
const express = require('express');
const {
  createOrUpdateUserProfile,
  getUserProfile,
  updateUserProfile
} = require('../controllers/userProfileController');

const router = express.Router();

// Create or upsert a profile, returns user_id
router.post('/user-profile', createOrUpdateUserProfile);

// Fetch a profile by user_id
router.get('/user-profile/:user_id', getUserProfile);

// Update an existing profile
router.put('/user-profile/:user_id', updateUserProfile);

module.exports = router;
