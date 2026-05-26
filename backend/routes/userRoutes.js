const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getUsers, getUserById } = require('../controllers/userController');

router.get('/', protect, getUsers);
router.get('/:id', protect, getUserById);

module.exports = router;
