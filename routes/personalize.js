// routes/personalize.js
const express = require('express');
const { personalizePlan } = require('../controllers/personalizeController');

const router = express.Router();

router.post('/personalize', personalizePlan);

module.exports = router;   // ← must export the router function
