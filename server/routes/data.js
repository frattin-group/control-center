const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

router.get('/initial-data', ClerkExpressRequireAuth(), dataController.getInitialData);
router.get('/branches', dataController.getBranches);
router.get('/sectors', dataController.getSectors);

module.exports = router;
