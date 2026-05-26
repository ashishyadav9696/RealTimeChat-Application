const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const Conversation = require('../models/Conversation');

// @desc    Get all users (except current user) with connection status
// @route   GET /api/users
// @access  Private
const getUsers = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Fetch all users except current
    const users = await User.find({ _id: { $ne: currentUserId } })
      .select('username email avatar isOnline lastSeen')
      .sort({ isOnline: -1, username: 1 });

    // Fetch all friend requests involving current user
    const requests = await FriendRequest.find({
      $or: [{ sender: currentUserId }, { receiver: currentUserId }],
    });

    // Map users with request status
    const usersWithStatus = users.map((user) => {
      const userObj = user.toObject();

      // Find request involving this user
      const request = requests.find(
        (r) =>
          (r.sender.toString() === currentUserId.toString() &&
            r.receiver.toString() === user._id.toString()) ||
          (r.receiver.toString() === currentUserId.toString() &&
            r.sender.toString() === user._id.toString())
      );

      if (!request) {
        userObj.friendStatus = 'none';
      } else if (request.status === 'accepted') {
        userObj.friendStatus = 'accepted';
      } else if (request.status === 'pending') {
        if (request.sender.toString() === currentUserId.toString()) {
          userObj.friendStatus = 'pending_sent';
        } else {
          userObj.friendStatus = 'pending_received';
        }
      } else {
        userObj.friendStatus = 'none';
      }

      userObj.requestId = request ? request._id : null;
      return userObj;
    });

    res.status(200).json({
      success: true,
      data: usersWithStatus,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users',
    });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      'username email avatar isOnline lastSeen'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user',
    });
  }
};

// @desc    Send a connection request
// @route   POST /api/users/request/send
// @access  Private
const sendFriendRequest = async (req, res) => {
  try {
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
        message: 'Cannot send a connection request to yourself',
      });
    }

    // Check if user exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Recipient user not found',
      });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId },
      ],
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A connection request already exists between you',
      });
    }

    // Create request
    const request = await FriendRequest.create({
      sender: senderId,
      receiver: receiverId,
      status: 'pending',
    });

    // Populate sender details for real-time notification
    const populatedRequest = await FriendRequest.findById(request._id).populate(
      'sender',
      'username email avatar isOnline'
    );

    // Emit real-time notification via Socket.io
    const io = req.app.get('io');
    if (io) {
      const receiverSocketId = io.onlineUsers?.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('friend-request-received', populatedRequest);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Connection request sent successfully',
      data: populatedRequest,
    });
  } catch (error) {
    console.error('Send request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending connection request',
    });
  }
};

// @desc    Accept a connection request
// @route   POST /api/users/request/accept
// @access  Private
const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user._id;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Request ID is required',
      });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found',
      });
    }

    // Verify current user is the receiver
    if (request.receiver.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to accept this request',
      });
    }

    // Update status
    request.status = 'accepted';
    await request.save();

    // Automatically create or fetch the Conversation between both participants
    const conversation = await Conversation.findOrCreate(
      request.sender,
      request.receiver
    );

    // Emit real-time update to both users via Socket
    const io = req.app.get('io');
    if (io) {
      // Notify sender that their request was accepted
      const senderSocketId = io.onlineUsers?.get(request.sender.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit('friend-request-accepted', {
          requestId: request._id,
          userId: userId, // receiver ID
        });
      }

      // Notify receiver (current user) that the connection is active
      const receiverSocketId = io.onlineUsers?.get(userId.toString());
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('friend-request-accepted', {
          requestId: request._id,
          userId: request.sender, // sender ID
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Connection request accepted successfully',
      data: request,
    });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error accepting connection request',
    });
  }
};

// @desc    Reject/Decline a connection request
// @route   POST /api/users/request/reject
// @access  Private
const rejectFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const userId = req.user._id;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: 'Request ID is required',
      });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found',
      });
    }

    // Verify current user is either the receiver or sender (to cancel request)
    if (
      request.receiver.toString() !== userId.toString() &&
      request.sender.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this request',
      });
    }

    const senderId = request.sender.toString();
    const receiverId = request.receiver.toString();

    // Delete the request entirely so they can try again later
    await FriendRequest.findByIdAndDelete(requestId);

    // Emit real-time notify via Socket
    const io = req.app.get('io');
    if (io) {
      const otherUserId = userId.toString() === senderId ? receiverId : senderId;
      const otherSocketId = io.onlineUsers?.get(otherUserId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('friend-request-rejected', {
          requestId: requestId,
          userId: userId,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Connection request declined/canceled successfully',
      data: { requestId },
    });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error rejecting connection request',
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
};
