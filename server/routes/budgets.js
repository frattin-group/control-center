const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

router.post('/update', ClerkExpressRequireAuth(), budgetController.updateBudget);

module.exports = router;
