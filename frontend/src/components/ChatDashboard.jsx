import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { initSocket, getSocket, disconnectSocket } from '../services/socket';
import api from '../services/api';
import UserList from './UserList';
import ChatWindow from './ChatWindow';
import toast from 'react-hot-toast';

function ChatDashboard() {
  const { user, token, logout } = useAuth();

  // State
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(true);

  const selectedUserRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/users');
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, []);

  // Fetch messages for a specific user
  const fetchMessages = useCallback(async (userId) => {
    setLoadingMessages(true);
    try {
      const response = await api.get(`/messages/${userId}`);
      if (response.data.success) {
        setMessages(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!token) return;

    const socket = initSocket(token);

    // Connection status
    socket.on('connect', () => {
      setConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    socket.on('reconnect', () => {
      setConnectionStatus('connected');
      fetchUsers(); // Refresh users on reconnect
    });

    // Online users list (received on initial connection)
    socket.on('online-users', (userIds) => {
      setOnlineUsers(userIds);
    });

    // User came online
    socket.on('user-online', ({ userId, username }) => {
      setOnlineUsers((prev) => {
        if (prev.includes(userId)) return prev;
        return [...prev, userId];
      });
      // Update users list
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, isOnline: true } : u))
      );
    });

    // User went offline
    socket.on('user-offline', ({ userId, lastSeen }) => {
      setOnlineUsers((prev) => prev.filter((id) => id !== userId));
      setUsers((prev) =>
        prev.map((u) =>
          u._id === userId ? { ...u, isOnline: false, lastSeen } : u
        )
      );
    });

    // Receive message
    socket.on('receive-message', (message) => {
      const currentSelected = selectedUserRef.current;
      const senderId = message.sender._id || message.sender;

      if (currentSelected && senderId === currentSelected._id) {
        // Message is from the currently selected user — add to messages
        setMessages((prev) => [...prev, message]);

        // Mark as read
        socket.emit('message-read', {
          messageId: message._id,
          senderId: senderId,
        });
      } else {
        // Message from another user — show toast notification
        const senderName = message.sender.username || 'Someone';
        const displayContent = message.messageType === 'text'
          ? message.content
          : `Sent a ${message.messageType || 'file'}${message.content ? `: ${message.content}` : ''}`;

        toast(
          `${senderName}: ${displayContent.substring(0, 50)}${
            displayContent.length > 50 ? '...' : ''
          }`,
          {
            icon: message.messageType === 'image' ? '📷' : message.messageType === 'video' ? '🎥' : '💬',
            duration: 4000,
          }
        );
      }
    });

    // Message sent confirmation
    socket.on('message-sent', (message) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m._id === message._id)) return prev;
        return [...prev, message];
      });
    });

    // Typing indicators
    socket.on('user-typing', ({ userId }) => {
      setTypingUser(userId);
    });

    socket.on('user-stop-typing', ({ userId }) => {
      setTypingUser((prev) => (prev === userId ? null : prev));
    });

    // Message read receipt
    socket.on('message-read-receipt', ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, isRead: true, readAt: new Date() } : m
        )
      );
    });

    // Message error
    socket.on('message-error', ({ message }) => {
      toast.error(message || 'Failed to send message');
    });

    // Fetch initial users
    fetchUsers();

    // Cleanup
    return () => {
      disconnectSocket();
    };
  }, [token, fetchUsers]);

  // Select a user and load messages
  const handleSelectUser = useCallback(
    (user) => {
      setSelectedUser(user);
      setTypingUser(null);
      fetchMessages(user._id);
      // On mobile, hide sidebar
      setMobileSidebarVisible(false);
    },
    [fetchMessages]
  );

  // Send message via socket
  const handleSendMessage = useCallback((receiverId, content) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('send-message', { receiverId, content });
    }
  }, []);

  // Send file message via API
  const handleSendFileMessage = useCallback(async (receiverId, file, content = '') => {
    const formData = new FormData();
    formData.append('receiverId', receiverId);
    formData.append('file', file);
    if (content) {
      formData.append('content', content);
    }

    try {
      const response = await api.post('/messages/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        const message = response.data.data;
        // Append locally to messages
        setMessages((prev) => [...prev, message]);
        return message;
      }
    } catch (error) {
      console.error('Failed to send file message:', error);
      toast.error(error.response?.data?.message || 'Failed to upload and send file');
      throw error;
    }
  }, []);

  // Typing events
  const handleTyping = useCallback((receiverId) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('typing', { receiverId });
    }
  }, []);

  const handleStopTyping = useCallback((receiverId) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('stop-typing', { receiverId });
    }
  }, []);

  // Back button on mobile
  const handleBack = useCallback(() => {
    setSelectedUser(null);
    setMobileSidebarVisible(true);
  }, []);

  // Logout handler
  const handleLogout = useCallback(async () => {
    disconnectSocket();
    await logout();
    toast.success('Logged out successfully');
  }, [logout]);

  return (
    <div className="chat-dashboard">
      {/* Connection status banner */}
      {connectionStatus !== 'connected' && (
        <div className={`connection-banner ${connectionStatus}`}>
          {connectionStatus === 'disconnected' &&
            '⚠ Connection lost. Trying to reconnect...'}
          {connectionStatus === 'reconnecting' && '🔄 Reconnecting...'}
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`sidebar ${
          !mobileSidebarVisible ? 'hidden' : ''
        }`}
      >
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">💬</div>
            <h2>ChatSphere</h2>
          </div>
          <div className="sidebar-actions">
            <button
              className="sidebar-btn logout-btn"
              onClick={handleLogout}
              title="Logout"
              id="logout-btn"
            >
              ⏻
            </button>
          </div>
        </div>

        <UserList
          users={users}
          selectedUser={selectedUser}
          onSelectUser={handleSelectUser}
          onlineUsers={onlineUsers}
          currentUser={user}
        />
      </div>

      {/* Chat Window */}
      <ChatWindow
        selectedUser={selectedUser}
        messages={messages}
        onSendMessage={handleSendMessage}
        onSendFileMessage={handleSendFileMessage}
        onTyping={handleTyping}
        onStopTyping={handleStopTyping}
        typingUser={typingUser}
        currentUser={user}
        onlineUsers={onlineUsers}
        loading={loadingMessages}
        onBack={handleBack}
      />
    </div>
  );
}

export default ChatDashboard;
