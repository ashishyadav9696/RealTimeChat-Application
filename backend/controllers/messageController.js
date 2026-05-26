const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// Validation rules for sending text messages
const sendMessageValidation = [
  body('receiverId').notEmpty().withMessage('Receiver ID is required'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 5000 })
    .withMessage('Message cannot exceed 5000 characters'),
];

// @desc    Get messages between current user and another user
// @route   GET /api/messages/:userId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Get messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username avatar')
      .populate('receiver', 'username avatar');

    // Mark unread messages from the other user as read
    await Message.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    // Get total count for pagination
    const total = await Message.countDocuments({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    });

    res.status(200).json({
      success: true,
      data: messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching messages',
    });
  }
};

// @desc    Send a text message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map((e) => e.msg),
      });
    }

    const { receiverId, content } = req.body;
    const senderId = req.user._id;

    // Don't allow sending messages to yourself
    if (senderId.toString() === receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send a message to yourself',
      });
    }

    // Create message
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      content,
      messageType: 'text',
    });

    // Update or create conversation
    const conversation = await Conversation.findOrCreate(senderId, receiverId);
    conversation.lastMessage = message._id;
    await conversation.save();

    // Populate and return the message
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username avatar')
      .populate('receiver', 'username avatar');

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending message',
    });
  }
};

// @desc    Send a file message (image/video)
// @route   POST /api/messages/upload
// @access  Private
const sendFileMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const { receiverId } = req.body;
    const senderId = req.user._id;

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Receiver ID is required',
      });
    }

    if (senderId.toString() === receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send a message to yourself',
      });
    }

    // Determine message type from mimetype
    let messageType = 'file';
    if (req.file.mimetype.startsWith('image/')) {
      messageType = 'image';
    } else if (req.file.mimetype.startsWith('video/')) {
      messageType = 'video';
    }

    // Build file URL
    const fileUrl = `/uploads/${req.file.filename}`;

    // Create message
    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      content: req.body.content || '',
      messageType,
      fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    // Update or create conversation
    const conversation = await Conversation.findOrCreate(senderId, receiverId);
    conversation.lastMessage = message._id;
    await conversation.save();

    // Populate and return the message
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username avatar')
      .populate('receiver', 'username avatar');

    // Emit real-time message via socket if receiver is online
    const io = req.app.get('io');
    if (io) {
      const receiverSocketId = io.onlineUsers?.get(receiverId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive-message', populatedMessage);
      }
    }

    res.status(201).json({
      success: true,
      data: populatedMessage,
    });
  } catch (error) {
    console.error('Send file message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading file',
    });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  sendMessageValidation,
  sendFileMessage,
};
