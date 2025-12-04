const express = require('express');
const router = express.Router();
const invoiceAnalysisController = require('../controllers/invoiceAnalysisController');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

// Protect the route with Clerk authentication
router.post('/analyze', ClerkExpressRequireAuth(), invoiceAnalysisController.analyzeInvoice);

module.exports = router;
