const express = require('express');
const router = express.Router();
const multer = require('multer');
const invoiceController = require('../controllers/invoiceController');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/analyze', ClerkExpressRequireAuth(), upload.single('file'), invoiceController.analyzeInvoice);

module.exports = router;
