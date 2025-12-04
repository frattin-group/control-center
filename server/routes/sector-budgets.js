const express = require('express');
const router = express.Router();
const sectorBudgetController = require('../controllers/sectorBudgetController');

router.get('/', sectorBudgetController.getSectorBudgets);
router.post('/', sectorBudgetController.upsertSectorBudget);
router.delete('/:id', sectorBudgetController.deleteSectorBudget);

module.exports = router;
