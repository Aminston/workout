const express         = require('express');
const requireApiToken = require('../middleware/requireApiToken');
const {
  createUserProfile,
  getUserProfile,
  updateUserProfile
} = require('../controllers/userProfileController');

const router = express.Router();

// Create profile (public)
router.post('/', createUserProfile);

// Get own profile (protected)
router.get('/', requireApiToken, getUserProfile);

// Update own profile (protected)
router.put('/', requireApiToken, updateUserProfile);

module.exports = router;
