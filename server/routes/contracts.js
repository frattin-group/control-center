const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

// Apply authentication middleware to all routes
router.use(ClerkExpressRequireAuth());

router.get('/', contractController.getContracts);
router.post('/', contractController.createContract);
router.put('/:id', contractController.updateContract);
router.delete('/:id', contractController.deleteContract);

module.exports = router;
