const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const FriendRequest = require('../models/FriendRequest');
const Group = require('../models/Group');

// Map to track online users: userId -> socketId
const onlineUsers = new Map();
// Map to track active calls: callerId -> { receiverId, callType, startTime, accepted }
const activeCalls = new Map();

const socketHandler = (io) => {
  io.onlineUsers = onlineUsers;

  // Middleware: authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`🟢 User connected: ${socket.user.username} (${userId})`);

    // Add to online users map
    onlineUsers.set(userId, socket.id);

    // Update user status in DB
    await User.findByIdAndUpdate(userId, { isOnline: true });

    // Broadcast user online status to all connected clients
    io.emit('user-online', {
      userId,
      username: socket.user.username,
    });

    // Send the current online users list to the newly connected client
    socket.emit('online-users', Array.from(onlineUsers.keys()));

    // Handle sending messages via socket
    socket.on('send-message', async (data) => {
      try {
        const { receiverId, content } = data;

        // Check if the recipient is a group
        const group = await Group.findById(receiverId);
        let message;
        let populatedMessage;

        if (group) {
          // Ensure sender is a member of the group
          if (!group.members.includes(userId)) {
            return socket.emit('message-error', { message: 'You must be a member of the group to send messages' });
          }

          // Create group message in DB
          message = await Message.create({
            sender: userId,
            group: receiverId,
            content,
          });

          // Update group's last message
          group.lastMessage = message._id;
          await group.save();

          // Populate the message
          populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username avatar profilePicture');

          // Broadcast to other online group members
          group.members.forEach((memberId) => {
            if (memberId.toString() !== userId) {
              const memberSocketId = onlineUsers.get(memberId.toString());
              if (memberSocketId) {
                io.to(memberSocketId).emit('receive-message', populatedMessage);
              }
            }
          });
        } else {
          // Private message logic
          // Check friendship status
          const isConnected = await FriendRequest.findOne({
            $or: [
              { sender: userId, receiver: receiverId },
              { sender: receiverId, receiver: userId }
            ],
            status: 'accepted'
          });

          if (!isConnected) {
            return socket.emit('message-error', { message: 'You must be connected to send messages' });
          }

          // Create message in DB
          message = await Message.create({
            sender: userId,
            receiver: receiverId,
            content,
          });

          // Update conversation
          const conversation = await Conversation.findOrCreate(
            userId,
            receiverId
          );
          conversation.lastMessage = message._id;
          await conversation.save();

          // Populate the message
          populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username avatar profilePicture')
            .populate('receiver', 'username avatar profilePicture');

          // Send message to receiver if they're online
          const receiverSocketId = onlineUsers.get(receiverId);
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive-message', populatedMessage);
          }
        }

        // Send confirmation back to sender
        socket.emit('message-sent', populatedMessage);
      } catch (error) {
        console.error('Socket send-message error:', error);
        socket.emit('message-error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      const { receiverId } = data;
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-typing', {
          userId,
          username: socket.user.username,
        });
      }
    });

    // Handle stop typing
    socket.on('stop-typing', (data) => {
      const { receiverId } = data;
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('user-stop-typing', {
          userId,
        });
      }
    });

    // Handle message read receipts
    socket.on('message-read', async (data) => {
      try {
        const { messageId, senderId } = data;

        // Update message in DB
        await Message.findByIdAndUpdate(messageId, {
          isRead: true,
          readAt: new Date(),
        });

        // Notify sender that message was read
        const senderSocketId = onlineUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('message-read-receipt', {
            messageId,
            readBy: userId,
            readAt: new Date(),
          });
        }
      } catch (error) {
        console.error('Socket message-read error:', error);
      }
    });

    // ===== Call Signaling Events =====

    // Initiate a call
    socket.on('call-user', (data) => {
      const { receiverId, callType, callerName, callerAvatar } = data;
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        // Record call initiation details
        activeCalls.set(userId, {
          receiverId,
          callType: callType || 'audio',
          accepted: false,
        });

        io.to(receiverSocketId).emit('incoming-call', {
          callerId: userId,
          callerName: callerName || socket.user.username,
          callerAvatar: callerAvatar || socket.user.avatar,
          callType: callType || 'audio', // 'audio' or 'video'
        });
      } else {
        socket.emit('call-error', { message: 'User is offline' });
      }
    });

    // Accept a call
    socket.on('call-accepted', (data) => {
      const { callerId } = data;
      const callerSocketId = onlineUsers.get(callerId);
      if (callerSocketId) {
        const callInfo = activeCalls.get(callerId);
        if (callInfo) {
          callInfo.accepted = true;
          callInfo.startTime = Date.now();
          activeCalls.set(callerId, callInfo);
        }

        io.to(callerSocketId).emit('call-accepted', {
          acceptedBy: userId,
          acceptedByName: socket.user.username,
        });
      }
    });

    // Reject a call
    socket.on('call-rejected', async (data) => {
      const { callerId } = data;
      const callerSocketId = onlineUsers.get(callerId);

      const callInfo = activeCalls.get(callerId);
      if (callInfo) {
        activeCalls.delete(callerId);
        try {
          const callTypeCapitalized = callInfo.callType.charAt(0).toUpperCase() + callInfo.callType.slice(1);
          const message = await Message.create({
            sender: callerId,
            receiver: userId,
            content: `Declined ${callTypeCapitalized} Call`,
            messageType: 'call',
          });

          const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username avatar profilePicture')
            .populate('receiver', 'username avatar profilePicture');

          socket.emit('receive-message', populatedMessage);
          if (callerSocketId) {
            io.to(callerSocketId).emit('receive-message', populatedMessage);
          }
        } catch (err) {
          console.error('Failed to log call rejection:', err);
        }
      }

      if (callerSocketId) {
        io.to(callerSocketId).emit('call-rejected', {
          rejectedBy: userId,
        });
      }
    });

    // End a call
    socket.on('call-ended', async (data) => {
      const { otherUserId } = data;

      const callerId = activeCalls.has(userId) ? userId : (activeCalls.has(otherUserId) ? otherUserId : null);
      if (callerId) {
        const callInfo = activeCalls.get(callerId);
        activeCalls.delete(callerId);

        if (callInfo && callInfo.accepted && callInfo.startTime) {
          const durationSec = Math.floor((Date.now() - callInfo.startTime) / 1000);
          const minutes = Math.floor(durationSec / 60);
          const seconds = durationSec % 60;
          const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          const callTypeCapitalized = callInfo.callType.charAt(0).toUpperCase() + callInfo.callType.slice(1);

          try {
            const message = await Message.create({
              sender: callerId,
              receiver: callInfo.receiverId,
              content: `${callTypeCapitalized} Call (${durationStr})`,
              messageType: 'call',
            });

            const populatedMessage = await Message.findById(message._id)
              .populate('sender', 'username avatar profilePicture')
              .populate('receiver', 'username avatar profilePicture');

            const callerSocketId = onlineUsers.get(callerId);
            const receiverSocketId = onlineUsers.get(callInfo.receiverId);

            if (callerSocketId) io.to(callerSocketId).emit('receive-message', populatedMessage);
            if (receiverSocketId) io.to(receiverSocketId).emit('receive-message', populatedMessage);
          } catch (err) {
            console.error('Failed to log call duration:', err);
          }
        } else if (callInfo) {
          // Missed Call (caller hung up before callee answered)
          try {
            const callTypeCapitalized = callInfo.callType.charAt(0).toUpperCase() + callInfo.callType.slice(1);
            const message = await Message.create({
              sender: callerId,
              receiver: callInfo.receiverId,
              content: `Missed ${callTypeCapitalized} Call`,
              messageType: 'call',
            });

            const populatedMessage = await Message.findById(message._id)
              .populate('sender', 'username avatar profilePicture')
              .populate('receiver', 'username avatar profilePicture');

            const callerSocketId = onlineUsers.get(callerId);
            const receiverSocketId = onlineUsers.get(callInfo.receiverId);

            if (callerSocketId) io.to(callerSocketId).emit('receive-message', populatedMessage);
            if (receiverSocketId) io.to(receiverSocketId).emit('receive-message', populatedMessage);
          } catch (err) {
            console.error('Failed to log missed call:', err);
          }
        }
      }

      const otherSocketId = onlineUsers.get(otherUserId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('call-ended', {
          endedBy: userId,
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`🔴 User disconnected: ${socket.user.username} (${userId})`);
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user-offline', { userId, lastSeen: new Date() });

      // Clean up calls involving this user
      const callerId = activeCalls.has(userId) ? userId : null;
      let receiverCallCallerId = null;
      for (const [cId, callInfo] of activeCalls.entries()) {
        if (callInfo.receiverId.toString() === userId) {
          receiverCallCallerId = cId;
          break;
        }
      }

      const activeCallCallerId = callerId || receiverCallCallerId;
      if (activeCallCallerId) {
        const callInfo = activeCalls.get(activeCallCallerId);
        activeCalls.delete(activeCallCallerId);

        if (callInfo && callInfo.accepted && callInfo.startTime) {
          const durationSec = Math.floor((Date.now() - callInfo.startTime) / 1000);
          const minutes = Math.floor(durationSec / 60);
          const seconds = durationSec % 60;
          const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          const callTypeCapitalized = callInfo.callType.charAt(0).toUpperCase() + callInfo.callType.slice(1);

          try {
            const message = await Message.create({
              sender: activeCallCallerId,
              receiver: callInfo.receiverId,
              content: `${callTypeCapitalized} Call (${durationStr})`,
              messageType: 'call',
            });

            const populatedMessage = await Message.findById(message._id)
              .populate('sender', 'username avatar profilePicture')
              .populate('receiver', 'username avatar profilePicture');

            const otherUserSocketId = onlineUsers.get(
              activeCallCallerId === userId ? callInfo.receiverId : activeCallCallerId
            );
            if (otherUserSocketId) {
              io.to(otherUserSocketId).emit('receive-message', populatedMessage);
              io.to(otherUserSocketId).emit('call-ended', { endedBy: userId });
            }
          } catch (err) {
            console.error('Failed to log call duration on disconnect:', err);
          }
        }
      }
    });
  });
};

module.exports = socketHandler;
