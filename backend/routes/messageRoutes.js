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
} = require('../controllers/messageController');

router.get('/:userId', protect, getMessages);
router.post('/', protect, sendMessageValidation, sendMessage);
router.post('/upload', protect, upload.single('file'), sendFileMessage);
router.delete('/conversation/:userId', protect, deleteConversation);

module.exports = router;
