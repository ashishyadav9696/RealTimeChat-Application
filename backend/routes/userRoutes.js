const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getUsers,
  getUserById,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
} = require('../controllers/userController');

router.get('/', protect, getUsers);
router.post('/request/send', protect, sendFriendRequest);
router.post('/request/accept', protect, acceptFriendRequest);
router.post('/request/reject', protect, rejectFriendRequest);
router.get('/:id', protect, getUserById);

module.exports = router;
