const express = require('express');
const { createUserProfile, getUserProfile } = require('../controllers/userProfileController');
const router = express.Router();

// 1️⃣ Create new profile → returns { userId }
router.post('/user-profile', createUserProfile);

// 2️⃣ Fetch profile by numeric ID
router.get('/user-profile/:userId', getUserProfile);

module.exports = router;
