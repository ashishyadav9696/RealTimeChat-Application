const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const FriendRequest = require('../models/FriendRequest');

// Map to track online users: userId -> socketId
const onlineUsers = new Map();

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
        const message = await Message.create({
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
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username avatar')
          .populate('receiver', 'username avatar');

        // Send message to receiver if they're online
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('receive-message', populatedMessage);
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

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(
        `🔴 User disconnected: ${socket.user.username} (${userId})`
      );

      // Remove from online users map
      onlineUsers.delete(userId);

      // Update user status in DB
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date(),
      });

      // Broadcast user offline status
      io.emit('user-offline', {
        userId,
        lastSeen: new Date(),
      });
    });
  });
};

module.exports = socketHandler;
