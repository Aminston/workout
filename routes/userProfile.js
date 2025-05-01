const express = require('express');
const router = express.Router();
const {
  createOrUpdateUserProfile,
  getUserProfile,
  updateUserProfile
} = require('../controllers/userProfileController');

// POST or update
router.post('/user-profile', createOrUpdateUserProfile);

// GET user profile
router.get('/user-profile/:user_id', getUserProfile);

// PUT update user profile
router.put('/user-profile/:user_id', updateUserProfile);

module.exports = router;
