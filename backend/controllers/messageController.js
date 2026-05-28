const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const FriendRequest = require('../models/FriendRequest');
const Group = require('../models/Group');
const { uploadFile } = require('../config/cloudinary');

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

    // Check if the target is a group
    const group = await Group.findById(userId);

    let messages;
    let total;

    if (group) {
      // Ensure current user is a member of the group
      if (!group.members.includes(currentUserId.toString())) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this group',
        });
      }

      // Get group messages
      messages = await Message.find({ group: userId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'username avatar profilePicture');

      total = await Message.countDocuments({ group: userId });
    } else {
      // Get messages between the two users
      messages = await Message.find({
        $or: [
          { sender: currentUserId, receiver: userId },
          { sender: userId, receiver: currentUserId },
        ],
      })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'username avatar profilePicture')
        .populate('receiver', 'username avatar profilePicture');

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
      total = await Message.countDocuments({
        $or: [
          { sender: currentUserId, receiver: userId },
          { sender: userId, receiver: currentUserId },
        ],
      });
    }

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

    // Check if the recipient is a group
    const group = await Group.findById(receiverId);
    let message;
    let populatedMessage;

    if (group) {
      // Ensure sender is a member of the group
      if (!group.members.includes(senderId.toString())) {
        return res.status(403).json({
          success: false,
          message: 'You must be a member of the group to send messages',
        });
      }

      // Create group message
      message = await Message.create({
        sender: senderId,
        group: receiverId,
        content,
        messageType: 'text',
      });

      // Update group's last message
      group.lastMessage = message._id;
      await group.save();

      // Populate sender details
      populatedMessage = await Message.findById(message._id)
        .populate('sender', 'username avatar profilePicture');
    } else {
      // Private message logic
      // Don't allow sending messages to yourself
      if (senderId.toString() === receiverId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot send a message to yourself',
        });
      }

      // Check friendship status
      const isConnected = await FriendRequest.findOne({
        $or: [
          { sender: senderId, receiver: receiverId },
          { sender: receiverId, receiver: senderId }
        ],
        status: 'accepted'
      });

      if (!isConnected) {
        return res.status(403).json({
          success: false,
          message: 'You must be connected to send messages'
        });
      }

      // Create private message
      message = await Message.create({
        sender: senderId,
        receiver: receiverId,
        content,
        messageType: 'text',
      });

      // Update or create conversation
      const conversation = await Conversation.findOrCreate(senderId, receiverId);
      conversation.lastMessage = message._id;
      await conversation.save();

      // Populate sender and receiver
      populatedMessage = await Message.findById(message._id)
        .populate('sender', 'username avatar profilePicture')
        .populate('receiver', 'username avatar profilePicture');
    }

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

    // Determine message type from mimetype
    let messageType = 'file';
    if (req.file.mimetype.startsWith('image/')) {
      messageType = 'image';
    } else if (req.file.mimetype.startsWith('video/')) {
      messageType = 'video';
    }

    // Upload to Cloudinary / local fallback
    const fileUrl = await uploadFile(req.file.path, 'messages');

    // Check if the recipient is a group
    const group = await Group.findById(receiverId);
    let message;
    let populatedMessage;

    if (group) {
      // Ensure sender is a member of the group
      if (!group.members.includes(senderId.toString())) {
        return res.status(403).json({
          success: false,
          message: 'You must be a member of the group to send messages',
        });
      }

      // Create group message
      message = await Message.create({
        sender: senderId,
        group: receiverId,
        content: req.body.content || '',
        messageType,
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      // Update group
      group.lastMessage = message._id;
      await group.save();

      // Populate message
      populatedMessage = await Message.findById(message._id)
        .populate('sender', 'username avatar profilePicture');

      // Emit real-time message via socket to all other group members
      const io = req.app.get('io');
      if (io) {
        group.members.forEach((memberId) => {
          if (memberId.toString() !== senderId.toString()) {
            const socketId = io.onlineUsers?.get(memberId.toString());
            if (socketId) {
              io.to(socketId).emit('receive-message', populatedMessage);
            }
          }
        });
      }
    } else {
      // Private message check
      if (senderId.toString() === receiverId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot send a message to yourself',
        });
      }

      // Check friendship status
      const isConnected = await FriendRequest.findOne({
        $or: [
          { sender: senderId, receiver: receiverId },
          { sender: receiverId, receiver: senderId }
        ],
        status: 'accepted'
      });

      if (!isConnected) {
        return res.status(403).json({
          success: false,
          message: 'You must be connected to send messages'
        });
      }

      // Create message
      message = await Message.create({
        sender: senderId,
        receiver: receiverId,
        content: req.body.content || '',
        messageType,
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      // Update conversation
      const conversation = await Conversation.findOrCreate(senderId, receiverId);
      conversation.lastMessage = message._id;
      await conversation.save();

      // Populate message
      populatedMessage = await Message.findById(message._id)
        .populate('sender', 'username avatar profilePicture')
        .populate('receiver', 'username avatar profilePicture');

      // Emit real-time message via socket if receiver is online
      const io = req.app.get('io');
      if (io) {
        const receiverSocketId = io.onlineUsers?.get(receiverId.toString());
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('receive-message', populatedMessage);
        }
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

// @desc    Delete conversation and messages between current user and target user
// @route   DELETE /api/messages/conversation/:userId
// @access  Private
const deleteConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // Delete all messages
    await Message.deleteMany({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId }
      ]
    });

    // Delete conversation record
    await Conversation.findOneAndDelete({
      participants: { $all: [currentUserId, userId] }
    });

    // Notify other user via Socket.io
    const io = req.app.get('io');
    if (io) {
      const otherSocketId = io.onlineUsers?.get(userId.toString());
      if (otherSocketId) {
        io.to(otherSocketId).emit('chat-deleted', { userId: currentUserId });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting conversation'
    });
  }
};

// @desc    Get unread message counts grouped by sender
// @route   GET /api/messages/unread/counts
// @access  Private
const getUnreadCounts = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    const counts = await Message.aggregate([
      {
        $match: {
          receiver: currentUserId,
          isRead: false,
        },
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 },
        },
      },
    ]);

    // Convert to { userId: count } format
    const unreadCounts = {};
    counts.forEach((item) => {
      unreadCounts[item._id.toString()] = item.count;
    });

    res.status(200).json({
      success: true,
      data: unreadCounts,
    });
  } catch (error) {
    console.error('Get unread counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching unread counts',
    });
  }
};

// @desc    Get call logs / history
// @route   GET /api/messages/calls/history
// @access  Private
const getCallHistory = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    const calls = await Message.find({
      messageType: 'call',
      $or: [{ sender: currentUserId }, { receiver: currentUserId }],
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'username avatar profilePicture')
      .populate('receiver', 'username avatar profilePicture');

    res.status(200).json({
      success: true,
      data: calls,
    });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching call history',
    });
  }
};

// @desc    Clear all call logs / history for the current user
// @route   DELETE /api/messages/calls/history
// @access  Private
const clearCallHistory = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Delete all call messages where the user is either the sender or receiver
    await Message.deleteMany({
      messageType: 'call',
      $or: [{ sender: currentUserId }, { receiver: currentUserId }],
    });

    res.status(200).json({
      success: true,
      message: 'Call history cleared successfully',
    });
  } catch (error) {
    console.error('Clear call history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error clearing call history',
    });
  }
};

// @desc    Delete a single call log / history entry
// @route   DELETE /api/messages/calls/:callId
// @access  Private
const deleteCallLog = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { callId } = req.params;

    // Delete the specific call message if current user is sender or receiver
    const result = await Message.deleteOne({
      _id: callId,
      messageType: 'call',
      $or: [{ sender: currentUserId }, { receiver: currentUserId }],
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call log not found or unauthorized',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Call log deleted successfully',
    });
  } catch (error) {
    console.error('Delete call log error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting call log',
    });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  sendMessageValidation,
  sendFileMessage,
  deleteConversation,
  getUnreadCounts,
  getCallHistory,
  clearCallHistory,
  deleteCallLog,
};
