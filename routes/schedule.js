const express = require('express');
const { getWeeklySchedule } = require('../controllers/scheduleController');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.get('/schedule', authenticate, getWeeklySchedule); // ✅ token optional

module.exports = router;