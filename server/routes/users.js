const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/', userController.getUsers);
// Create user (with Auth)
router.post('/create-with-auth', userController.createUserWithAuth);

// Create user (DB only - legacy/internal)
router.post('/', userController.createUser);

router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
