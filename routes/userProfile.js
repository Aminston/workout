// routes/userProfile.js

const express            = require('express');
const requireApiToken    = require('../middleware/requireApiToken');
const {
  createUserProfile,
  getUserProfile,
  updateUserProfile
} = require('../controllers/userProfileController');

const router = express.Router();

// 1) Public signup (no token needed)
router.post('/user-profile', createUserProfile);

// 2) Protected: fetch & update (token in header or ?token=…)
router.get('/user-profile',    requireApiToken, getUserProfile);
router.put('/user-profile',    requireApiToken, updateUserProfile);

module.exports = router;
