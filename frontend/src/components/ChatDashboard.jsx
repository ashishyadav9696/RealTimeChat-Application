import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { initSocket, getSocket, disconnectSocket } from '../services/socket';
import api from '../services/api';
import UserList from './UserList';
import ChatWindow from './ChatWindow';
import CallModal from './CallModal';
import GroupModal from './GroupModal';
import ProfileModal from './ProfileModal';
import { MessageCircle, LogOut, Plus, Settings, Sun, Moon } from 'lucide-react';
import toast from 'react-hot-toast';

function ChatDashboard() {
  const { user, token, logout, updateUser } = useAuth();

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('chatsphere_theme') || 'light';
  });

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chatsphere_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // State
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(true);
  const [activeTab, setActiveTab] = useState('chats');
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentUserData, setCurrentUserData] = useState(user);
  const [groups, setGroups] = useState([]);
  const [callHistory, setCallHistory] = useState([]);

  // Call state
  const [callState, setCallState] = useState(null);
  // callState: { status: 'outgoing'|'incoming'|'connected'|'ended', callType, userName, userAvatar, profilePicture, userId }

  // WebRTC Stream & Toggle States
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const callStateRef = useRef(null);

  // Sync callStateRef with callState to avoid stale closures in socket events
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const selectedUserRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Keep currentUserData in sync
  useEffect(() => {
    setCurrentUserData(user);
  }, [user]);

  // Fetch unread counts
  const fetchUnreadCounts = useCallback(async () => {
    try {
      const response = await api.get('/messages/unread/counts');
      if (response.data.success) {
        setUnreadCounts(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch unread counts:', error);
    }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/users');
      if (response.data.success) {
        const list = response.data.data;
        setUsers(list);

        // Keep selected user state in sync
        const currentSelected = selectedUserRef.current;
        if (currentSelected) {
          const updated = list.find((u) => u._id === currentSelected._id);
          if (updated) {
            setSelectedUser(updated);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, []);

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    try {
      const response = await api.get('/users/groups');
      if (response.data.success) {
        setGroups(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  }, []);

  // Fetch call history
  const fetchCallHistory = useCallback(async () => {
    try {
      const response = await api.get('/messages/calls/history');
      if (response.data.success) {
        setCallHistory(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch call history:', error);
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

  // ===== WebRTC Calling Helpers =====

  const stopMediaTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoOff(false);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, []);

  const captureLocalMedia = useCallback(async (callType) => {
    try {
      const constraints = {
        audio: true,
        video: callType === 'video'
          ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      console.error('Error capturing media device:', error);
      toast.error('Could not access microphone or camera. Falling back to audio-only.');
      
      // Fallback to audio-only
      if (callType === 'video') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setLocalStream(stream);
          localStreamRef.current = stream;
          return stream;
        } catch (fallbackError) {
          console.error('Audio fallback failed:', fallbackError);
        }
      }
      return null;
    }
  }, []);

  const initPeerConnection = useCallback((targetUserId, stream) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    peerConnectionRef.current = pc;

    // Add local stream tracks to RTCPeerConnection
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // ICE candidates handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        if (socket) {
          socket.emit('webrtc-candidate', {
            candidate: event.candidate,
            targetId: targetUserId,
          });
        }
      }
    };

    // Remote stream track handler
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    return pc;
  }, []);

  const initiateOffer = async (targetUserId, stream) => {
    try {
      const pc = initPeerConnection(targetUserId, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const socket = getSocket();
      if (socket) {
        socket.emit('webrtc-offer', {
          offer,
          receiverId: targetUserId,
        });
      }
    } catch (error) {
      console.error('Failed to initiate SDP offer:', error);
    }
  };

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newVal = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !newVal;
        });
      }
      return newVal;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoOff((prev) => {
      const newVal = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = !newVal;
        });
      }
      return newVal;
    });
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
      fetchGroups(); // Refresh groups on reconnect
      fetchCallHistory(); // Refresh call history on reconnect
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
      if (message.messageType === 'call') {
        fetchCallHistory();
      }
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
        // Message from another user — increment unread count
        setUnreadCounts((prev) => ({
          ...prev,
          [senderId]: (prev[senderId] || 0) + 1,
        }));

        // Show toast notification
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

    // Friend Request Received
    socket.on('friend-request-received', (request) => {
      fetchUsers();
      toast(`${request.sender.username} sent you a connection request!`, {
        icon: '👋',
        duration: 4000,
      });
    });

    // Friend Request Accepted
    socket.on('friend-request-accepted', ({ requestId, userId }) => {
      fetchUsers();
      toast.success('Connection request accepted!');
      const currentSelected = selectedUserRef.current;
      if (currentSelected && currentSelected._id === userId) {
        fetchMessages(userId);
      }
    });

    // Friend Request Rejected
    socket.on('friend-request-rejected', ({ requestId, userId }) => {
      fetchUsers();
      toast('Connection request declined or cancelled.', { icon: 'ℹ️' });
    });

    // Chat Deleted
    socket.on('chat-deleted', ({ userId }) => {
      const currentSelected = selectedUserRef.current;
      if (currentSelected && currentSelected._id === userId) {
        setMessages([]);
        toast('This conversation was deleted.', { icon: '🗑️' });
      }
    });

    // Group Updated (e.g. member left)
    socket.on('group-updated', ({ groupId }) => {
      fetchGroups();
      const currentSelected = selectedUserRef.current;
      if (currentSelected && currentSelected._id === groupId) {
        api.get('/users/groups').then((response) => {
          if (response.data.success) {
            const updatedGroup = response.data.data.find((g) => g._id === groupId);
            if (updatedGroup) {
              setSelectedUser(updatedGroup);
            }
          }
        });
      }
    });

    // ===== Call Events =====
    socket.on('incoming-call', ({ callerId, callerName, callerAvatar, callType }) => {
      const callerUser = users.find(u => u._id === callerId);
      setCallState({
        status: 'incoming',
        callType,
        userName: callerName,
        userAvatar: callerAvatar,
        profilePicture: callerUser?.profilePicture || '',
        userId: callerId,
      });
    });

    socket.on('call-accepted', async () => {
      setCallState((prev) => prev ? { ...prev, status: 'connected' } : null);
      const currentCall = callStateRef.current;
      if (currentCall) {
        const stream = await captureLocalMedia(currentCall.callType);
        await initiateOffer(currentCall.userId, stream);
      }
    });

    socket.on('call-rejected', () => {
      setCallState((prev) => prev ? { ...prev, status: 'ended' } : null);
      toast('Call was declined', { icon: '📞' });
      stopMediaTracks();
      fetchCallHistory();
    });

    socket.on('call-ended', () => {
      setCallState((prev) => prev ? { ...prev, status: 'ended' } : null);
      stopMediaTracks();
      fetchCallHistory();
    });

    socket.on('call-error', ({ message }) => {
      toast.error(message);
      setCallState(null);
      stopMediaTracks();
    });

    // ===== WebRTC Signaling Event Receivers =====
    socket.on('webrtc-offer', async ({ offer, senderId }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc-answer', {
            answer,
            callerId: senderId,
          });
        }
      } catch (err) {
        console.error('Error handling webrtc-offer:', err);
      }
    });

    socket.on('webrtc-answer', async ({ answer }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (err) {
        console.error('Error handling webrtc-answer:', err);
      }
    });

    socket.on('webrtc-candidate', async ({ candidate }) => {
      try {
        const pc = peerConnectionRef.current;
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('Error adding Ice Candidate:', err);
      }
    });

    // Fetch initial data
    fetchUsers();
    fetchUnreadCounts();
    fetchGroups();
    fetchCallHistory();
 
    // Cleanup
    return () => {
      stopMediaTracks();
      disconnectSocket();
    };
  }, [token, fetchUsers, fetchUnreadCounts, fetchGroups, fetchCallHistory, stopMediaTracks, captureLocalMedia, initiateOffer]);

  // Select a user and load messages
  const handleSelectUser = useCallback(
    (user) => {
      setSelectedUser(user);
      setTypingUser(null);
      fetchMessages(user._id);
      // Clear unread count for this user
      setUnreadCounts((prev) => {
        const updated = { ...prev };
        delete updated[user._id];
        return updated;
      });
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

  // Send connection request
  const handleSendRequest = useCallback(async (receiverId) => {
    try {
      const response = await api.post('/users/request/send', { receiverId });
      if (response.data.success) {
        toast.success('Connection request sent!');
        setUsers((prev) =>
          prev.map((u) =>
            u._id === receiverId
              ? { ...u, friendStatus: 'pending_sent', requestId: response.data.data._id }
              : u
          )
        );
        setSelectedUser((prev) => {
          if (prev && prev._id === receiverId) {
            return { ...prev, friendStatus: 'pending_sent', requestId: response.data.data._id };
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to send connection request:', error);
      toast.error(error.response?.data?.message || 'Failed to send request');
    }
  }, []);

  // Accept connection request
  const handleAcceptRequest = useCallback(async (requestId) => {
    try {
      const response = await api.post('/users/request/accept', { requestId });
      if (response.data.success) {
        toast.success('Connection request accepted!');
        await fetchUsers();
        const currentSelected = selectedUserRef.current;
        if (currentSelected && currentSelected.requestId === requestId) {
          setSelectedUser((prev) => ({ ...prev, friendStatus: 'accepted' }));
          fetchMessages(currentSelected._id);
        }
      }
    } catch (error) {
      console.error('Failed to accept connection request:', error);
      toast.error(error.response?.data?.message || 'Failed to accept request');
    }
  }, [fetchUsers, fetchMessages]);

  // Reject/Decline connection request
  const handleRejectRequest = useCallback(async (requestId) => {
    try {
      const response = await api.post('/users/request/reject', { requestId });
      if (response.data.success) {
        toast.success('Connection request declined/cancelled');
        await fetchUsers();
        const currentSelected = selectedUserRef.current;
        if (currentSelected && currentSelected.requestId === requestId) {
          setSelectedUser((prev) => ({ ...prev, friendStatus: 'none', requestId: null }));
        }
      }
    } catch (error) {
      console.error('Failed to reject connection request:', error);
      toast.error(error.response?.data?.message || 'Failed to reject request');
    }
  }, [fetchUsers]);

  // Delete chat conversation
  const handleDeleteChat = useCallback(async (userId) => {
    try {
      const response = await api.delete(`/messages/conversation/${userId}`);
      if (response.data.success) {
        toast.success('Chat deleted successfully');
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
      toast.error(error.response?.data?.message || 'Failed to delete chat');
    }
  }, []);

  // Leave group
  const handleLeaveGroup = useCallback(async (groupId) => {
    try {
      const response = await api.post(`/users/groups/${groupId}/leave`);
      if (response.data.success) {
        toast.success(response.data.message || 'Left group successfully');
        setSelectedUser(null);
        setMobileSidebarVisible(true);
        fetchGroups();
      }
    } catch (error) {
      console.error('Failed to leave group:', error);
      toast.error(error.response?.data?.message || 'Failed to leave group');
    }
  }, [fetchGroups]);

  // Call handlers
  const handleStartCall = useCallback((userId, callType) => {
    const targetUser = users.find(u => u._id === userId);
    if (!targetUser) return;

    const socket = getSocket();
    if (!socket) return;

    socket.emit('call-user', {
      receiverId: userId,
      callType,
      callerName: currentUserData?.username,
      callerAvatar: currentUserData?.avatar,
    });

    setCallState({
      status: 'outgoing',
      callType,
      userName: targetUser.username,
      userAvatar: targetUser.avatar,
      profilePicture: targetUser.profilePicture,
      userId,
    });
  }, [users, currentUserData]);

  const handleAcceptCall = useCallback(async () => {
    const socket = getSocket();
    if (socket && callState) {
      socket.emit('call-accepted', { callerId: callState.userId });
      setCallState((prev) => prev ? { ...prev, status: 'connected' } : null);
      const stream = await captureLocalMedia(callState.callType);
      initPeerConnection(callState.userId, stream);
    }
  }, [callState, captureLocalMedia, initPeerConnection]);

  const handleRejectCall = useCallback(() => {
    const socket = getSocket();
    if (socket && callState) {
      socket.emit('call-rejected', { callerId: callState.userId });
    }
    setCallState(null);
    stopMediaTracks();
    fetchCallHistory();
  }, [callState, stopMediaTracks, fetchCallHistory]);

  const handleEndCall = useCallback(() => {
    const socket = getSocket();
    if (socket && callState) {
      socket.emit('call-ended', { otherUserId: callState.userId });
    }
    setCallState(null);
    stopMediaTracks();
    fetchCallHistory();
  }, [callState, stopMediaTracks, fetchCallHistory]);

  // Group creation
  const handleCreateGroup = useCallback(async ({ name, members }) => {
    try {
      const response = await api.post('/users/groups', { name, members });
      if (response.data.success) {
        toast.success(`Group "${name}" created!`);
        fetchGroups(); // Refresh groups list
        return response.data.data;
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      toast.error(error.response?.data?.message || 'Failed to create group');
      throw error;
    }
  }, [fetchGroups]);

  // Profile update handler
  const handleUpdateUser = useCallback((updatedUser) => {
    setCurrentUserData((prev) => ({ ...prev, ...updatedUser }));
    updateUser(updatedUser);
  }, [updateUser]);

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
            <div className="sidebar-brand-icon">
              <MessageCircle />
            </div>
            <h2>ChatSphere</h2>
          </div>
          <div className="sidebar-actions">
            <button
              className="sidebar-btn theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              id="theme-toggle-btn"
            >
              {theme === 'light' ? <Moon /> : <Sun />}
            </button>
            <button
              className="sidebar-btn"
              onClick={() => setShowGroupModal(true)}
              title="Create Group"
              id="create-group-btn"
            >
              <Plus />
            </button>
            <button
              className="sidebar-btn logout-btn"
              onClick={handleLogout}
              title="Logout"
              id="logout-btn"
            >
              <LogOut />
            </button>
          </div>
        </div>

        <UserList
          users={users}
          groups={groups}
          callHistory={callHistory}
          selectedUser={selectedUser}
          onSelectUser={handleSelectUser}
          onlineUsers={onlineUsers}
          currentUser={currentUserData}
          onSendRequest={handleSendRequest}
          onAcceptRequest={handleAcceptRequest}
          onRejectRequest={handleRejectRequest}
          unreadCounts={unreadCounts}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenProfile={() => setShowProfileModal(true)}
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
        currentUser={currentUserData}
        onlineUsers={onlineUsers}
        loading={loadingMessages}
        onBack={handleBack}
        onDeleteChat={handleDeleteChat}
        onSendRequest={handleSendRequest}
        onAcceptRequest={handleAcceptRequest}
        onRejectRequest={handleRejectRequest}
        onStartCall={handleStartCall}
        onLeaveGroup={handleLeaveGroup}
      />

      {/* Call Modal */}
      {callState && (
        <CallModal
          callState={callState}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          onEnd={handleEndCall}
          localStream={localStream}
          remoteStream={remoteStream}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
        />
      )}

      {/* Group Creation Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        users={users}
        onCreateGroup={handleCreateGroup}
      />

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        currentUser={currentUserData}
        onUpdateUser={handleUpdateUser}
      />
    </div>
  );
}

export default ChatDashboard;
