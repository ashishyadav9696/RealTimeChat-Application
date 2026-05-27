const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
  getUsers,
  getUserById,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  updateProfile,
  createGroup,
  getGroups,
  leaveGroup,
} = require('../controllers/userController');

router.get('/', protect, getUsers);
router.put('/profile', protect, upload.single('profilePicture'), updateProfile);
router.post('/request/send', protect, sendFriendRequest);
router.post('/request/accept', protect, acceptFriendRequest);
router.post('/request/reject', protect, rejectFriendRequest);
router.get('/groups', protect, getGroups);
router.post('/groups', protect, upload.single('avatar'), createGroup);
router.post('/groups/:groupId/leave', protect, leaveGroup);
router.get('/:id', protect, getUserById);

module.exports = router;
