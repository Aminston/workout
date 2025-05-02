// routes/ai.js
const express             = require('express');
const requireApiToken     = require('../middleware/requireApiToken');
const { personalizePlan } = require('../controllers/openaiController');

const router = express.Router();

// POST /api/personalize
router.post('/', requireApiToken, personalizePlan);

module.exports = router;
