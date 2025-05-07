const express = require('express');
const authenticate = require('../middleware/auth');
const { updateUserProfile } = require('../controllers/userProfileController');

const router = express.Router();

// ✅ Only allow PUT to update profile
router.put('/', authenticate, updateUserProfile);

module.exports = router;
