// routes/schedule.js
const express               = require('express');
const { getWeeklySchedule } = require('../controllers/scheduleController');

const router = express.Router();

// GET /weekly-schedule
router.get('/weekly-schedule', getWeeklySchedule);

module.exports = router;
