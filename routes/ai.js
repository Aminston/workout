const express = require('express');
const router = express.Router();
const aiController = require('../controllers/openaiController');
const authenticate = require('../middleware/auth');

router.post('/plan', authenticate, aiController.personalizePlan);
router.delete('/reset', authenticate, aiController.resetPersonalizedPlan);

module.exports = router;
