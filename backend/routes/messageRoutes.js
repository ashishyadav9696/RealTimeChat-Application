const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const {
  getMessages,
  sendMessage,
  sendMessageValidation,
  sendFileMessage,
  deleteConversation,
  getUnreadCounts,
  getCallHistory,
} = require('../controllers/messageController');

router.get('/unread/counts', protect, getUnreadCounts);
router.get('/calls/history', protect, getCallHistory);
router.get('/:userId', protect, getMessages);
router.post('/', protect, sendMessageValidation, sendMessage);
router.post('/upload', protect, upload.single('file'), sendFileMessage);
router.delete('/conversation/:userId', protect, deleteConversation);

module.exports = router;
