const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

router.get('/', ClerkExpressRequireAuth(), expenseController.getExpenses);
router.post('/', ClerkExpressRequireAuth(), expenseController.createExpense);
router.put('/:id', ClerkExpressRequireAuth(), expenseController.updateExpense);
router.delete('/:id', ClerkExpressRequireAuth(), expenseController.deleteExpense);

module.exports = router;
