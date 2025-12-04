const express = require('express');
const router = express.Router();
const masterDataController = require('../controllers/masterDataController');

// Sectors
router.get('/sectors', masterDataController.getSectors);
router.post('/sectors', masterDataController.createSector);
router.put('/sectors/:id', masterDataController.updateSector);
router.delete('/sectors/:id', masterDataController.deleteSector);

// Branches
router.get('/branches', masterDataController.getBranches);
router.post('/branches', masterDataController.createBranch);
router.put('/branches/:id', masterDataController.updateBranch);
router.delete('/branches/:id', masterDataController.deleteBranch);

// Marketing Channels
router.get('/marketing-channels', masterDataController.getMarketingChannels);
router.post('/marketing-channels', masterDataController.createMarketingChannel);
router.put('/marketing-channels/:id', masterDataController.updateMarketingChannel);
router.delete('/marketing-channels/:id', masterDataController.deleteMarketingChannel);

// Channel Categories
router.get('/channel-categories', masterDataController.getChannelCategories);
router.post('/channel-categories', masterDataController.createChannelCategory);
router.put('/channel-categories/:id', masterDataController.updateChannelCategory);
router.delete('/channel-categories/:id', masterDataController.deleteChannelCategory);

module.exports = router;
