import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Trash2, Paperclip, Send, X, File, Download, Check, CheckCheck, Phone, Video, MessageSquare, UserPlus, Clock, PhoneMissed, LogOut } from 'lucide-react';
import TypingIndicator from './TypingIndicator';

const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${url}`;
};

function ChatWindow({
  selectedUser,
  messages,
  onSendMessage,
  onSendFileMessage,
  onTyping,
  onStopTyping,
  typingUser,
  currentUser,
  onlineUsers,
  loading,
  onBack,
  onDeleteChat,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onStartCall,
  onLeaveGroup,
}) {
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const handleLeaveGroupClick = () => {
    if (!selectedUser) return;
    const confirmLeave = window.confirm(`Are you sure you want to leave the group "${selectedUser.name}"?`);
    if (confirmLeave) {
      onLeaveGroup(selectedUser._id);
    }
  };

  const handleDeleteClick = () => {
    if (!selectedUser) return;
    const isGroup = !!selectedUser.members;
    const confirmMessage = isGroup
      ? `Are you sure you want to delete this group chat history?`
      : `Are you sure you want to delete this chat? This will erase the message history for both of you.`;
    const confirmDelete = window.confirm(confirmMessage);
    if (confirmDelete) {
      onDeleteChat(selectedUser._id);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('File size exceeds the 50MB limit.');
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      setFileType('image');
      setFilePreview(URL.createObjectURL(file));
    } else if (file.type.startsWith('video/')) {
      setFileType('video');
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFileType('file');
      setFilePreview(null);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    setFileType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [message]);

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current && selectedUser) {
      isTypingRef.current = true;
      onTyping(selectedUser._id);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current && selectedUser) {
        isTypingRef.current = false;
        onStopTyping(selectedUser._id);
      }
    }, 2000);
  }, [selectedUser, onTyping, onStopTyping]);

  const handleInputChange = (e) => {
    setMessage(e.target.value);
    handleTyping();
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!selectedUser) return;

    if (selectedFile) {
      setUploading(true);
      try {
        await onSendFileMessage(selectedUser._id, selectedFile, trimmed);
        handleClearFile();
        setMessage('');
      } catch (error) {
        // error is toasted
      } finally {
        setUploading(false);
      }
    } else {
      if (!trimmed) return;
      onSendMessage(selectedUser._id, trimmed);
      setMessage('');
    }

    // Stop typing indicator
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onStopTyping(selectedUser._id);
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageTime = (date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateDivider = (date) => {
    const msgDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (msgDate.toDateString() === today.toDateString()) return 'Today';
    if (msgDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return msgDate.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  // Group messages by date
  const getMessagesWithDividers = () => {
    const result = [];
    let lastDate = null;

    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) {
        result.push({ type: 'divider', date: msg.createdAt, key: `div-${msg.createdAt}` });
        lastDate = msgDate;
      }
      result.push({ type: 'message', data: msg, key: msg._id });
    });

    return result;
  };

  // Empty state — no user selected
  if (!selectedUser) {
    return (
      <div className="chat-main">
        <div className="chat-empty">
          <div className="chat-empty-icon">
            <MessageSquare />
          </div>
          <h3>Welcome to ChatSphere</h3>
          <p>
            Select a conversation from the sidebar to start chatting, or search
            for a user to begin a new conversation.
          </p>
        </div>
      </div>
    );
  }

  const isOnline = onlineUsers.includes(selectedUser._id);
  const groupedMessages = getMessagesWithDividers();
  const isGroup = !!selectedUser.members;
  const canChat = isGroup || selectedUser.friendStatus === 'accepted';

  return (
    <div className="chat-main">
      {/* Chat Header */}
      <div className="chat-header">
        <button
          className="chat-header-back"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft />
        </button>

        <div className={`user-avatar ${!isGroup && isOnline ? 'online' : ''}`}>
          {isGroup ? (
            <>
              {selectedUser.avatar && (
                <img 
                  src={getMediaUrl(selectedUser.avatar)} 
                  alt={selectedUser.name} 
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const fallback = e.target.parentElement.querySelector('.avatar-fallback');
                    if (fallback) fallback.style.display = 'inline-block';
                  }}
                />
              )}
              <span 
                className="avatar-fallback" 
                style={{ display: selectedUser.avatar ? 'none' : 'inline-block' }}
              >
                {selectedUser.name.substring(0, 2).toUpperCase()}
              </span>
            </>
          ) : (
            <>
              {selectedUser.profilePicture && (
                <img 
                  src={getMediaUrl(selectedUser.profilePicture)} 
                  alt={selectedUser.username} 
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const fallback = e.target.parentElement.querySelector('.avatar-fallback');
                    if (fallback) fallback.style.display = 'inline-block';
                  }}
                />
              )}
              <span 
                className="avatar-fallback" 
                style={{ display: selectedUser.profilePicture ? 'none' : 'inline-block' }}
              >
                {selectedUser.avatar || selectedUser.username.substring(0, 2).toUpperCase()}
              </span>
            </>
          )}
          {!isGroup && (
            <span
              className={`user-status-dot ${isOnline ? 'online' : ''}`}
            ></span>
          )}
        </div>

        <div className="chat-header-info">
          <div className="chat-header-name">{isGroup ? selectedUser.name : selectedUser.username}</div>
          <div className="chat-header-status">
            {!isGroup && <span className={`mini-dot ${isOnline ? 'online' : ''}`}></span>}
            {isGroup ? `${selectedUser.members?.length || 0} members` : (isOnline ? 'Online' : 'Offline')}
          </div>
        </div>

        {canChat && (
          <div className="chat-header-actions">
            {!isGroup && (
              <>
                <button
                  className="header-action-btn call-audio"
                  onClick={() => onStartCall && onStartCall(selectedUser._id, 'audio')}
                  title="Audio Call"
                >
                  <Phone />
                </button>
                <button
                  className="header-action-btn call-video"
                  onClick={() => onStartCall && onStartCall(selectedUser._id, 'video')}
                  title="Video Call"
                >
                  <Video />
                </button>
              </>
            )}
            {isGroup && (
              <button
                className="header-action-btn leave-group"
                onClick={handleLeaveGroupClick}
                title="Leave Group"
              >
                <LogOut />
              </button>
            )}
            <button
              className="header-action-btn delete-chat"
              onClick={handleDeleteClick}
              title={isGroup ? "Delete Chat History" : "Delete Chat"}
            >
              <Trash2 />
            </button>
          </div>
        )}
      </div>

      {canChat ? (
        <>
          {/* Messages Area */}
          <div className="chat-messages" id="chat-messages-area">
            {loading ? (
          // Loading skeletons
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '16px',
            }}
          >
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="message-row"
                style={{
                  justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end',
                }}
              >
                <div
                  className="skeleton"
                  style={{
                    width: `${150 + Math.random() * 150}px`,
                    height: '42px',
                    borderRadius: '12px',
                  }}
                ></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {groupedMessages.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--font-sm)',
                  animation: 'fadeIn 300ms ease-out',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>
                  <MessageSquare style={{ width: 40, height: 40, color: 'var(--accent-teal)', opacity: 0.5 }} />
                </div>
                <p>
                  No messages yet. Say hello to{' '}
                  <strong style={{ color: 'var(--accent-teal)' }}>
                    {selectedUser.username}
                  </strong>
                  !
                </p>
              </div>
            ) : (
              groupedMessages.map((item) => {
                if (item.type === 'divider') {
                  return (
                    <div className="message-date-divider" key={item.key}>
                      <span>{formatDateDivider(item.date)}</span>
                    </div>
                  );
                }

                const msg = item.data;
                const isSent =
                  (msg.sender._id || msg.sender) === currentUser._id;

                if (msg.messageType === 'call') {
                  const isMissed = !isSent && (msg.content?.toLowerCase().includes('missed') || msg.content?.toLowerCase().includes('declined'));
                  const isVideo = msg.content?.toLowerCase().includes('video');
                  const durationMatch = msg.content?.match(/\(([^)]+)\)/);
                  const duration = durationMatch ? durationMatch[1] : null;

                  return (
                    <div className="message-call-log-wrapper animate-fade-in" key={item.key}>
                      <div className={`message-call-log-badge ${isMissed ? 'missed' : ''}`}>
                        <span className="call-log-icon">
                          {isMissed ? (
                            <PhoneMissed className="icon-danger" />
                          ) : isVideo ? (
                            <Video className="icon-violet" />
                          ) : (
                            <Phone className="icon-teal" />
                          )}
                        </span>
                        <div className="call-log-info">
                          <span className="call-log-title">
                            {isSent ? 'Outgoing' : isMissed ? 'Missed' : 'Incoming'}{' '}
                            {isVideo ? 'Video' : 'Audio'} Call
                          </span>
                          {duration && (
                            <span className="call-log-duration">({duration})</span>
                          )}
                        </div>
                        <span className="call-log-time">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    className={`message-row ${isSent ? 'sent' : 'received'}`}
                    key={item.key}
                  >
                    <div className="message-bubble">
                      {msg.messageType === 'image' && (
                        <div className="message-media-container image">
                          <img 
                            src={getMediaUrl(msg.fileUrl)} 
                            alt={msg.fileName || "Image"} 
                            className="message-image"
                            onClick={() => setFullScreenImage(getMediaUrl(msg.fileUrl))}
                            loading="lazy"
                          />
                        </div>
                      )}
                      {msg.messageType === 'video' && (
                        <div className="message-media-container video">
                          <video 
                            src={getMediaUrl(msg.fileUrl)} 
                            controls 
                            className="message-video"
                            preload="metadata"
                          />
                        </div>
                      )}
                      {msg.messageType === 'file' && (
                        <div className="message-file-card">
                          <span className="file-icon"><File /></span>
                          <div className="file-info">
                            <span className="file-name" title={msg.fileName}>{msg.fileName}</span>
                            <span className="file-size">{(msg.fileSize / 1024).toFixed(1)} KB</span>
                          </div>
                          <a 
                            href={getMediaUrl(msg.fileUrl)} 
                            download={msg.fileName} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="file-download-btn"
                          >
                            <Download />
                          </a>
                        </div>
                      )}
                      {msg.content && <div className="message-content">{msg.content}</div>}
                      <div className="message-meta">
                        <span className="message-time">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        {isSent && (
                          <span
                            className={`message-read-status ${
                              msg.isRead ? 'read' : ''
                            }`}
                          >
                            {msg.isRead ? <CheckCheck /> : <Check />}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {typingUser && typingUser === selectedUser._id && (
              <TypingIndicator username={selectedUser.username} />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        {selectedFile && (
          <div className="file-preview-area">
            <div className="file-preview-card animate-scale-in">
              {fileType === 'image' && (
                <div className="preview-thumbnail">
                  <img src={filePreview} alt="upload preview" />
                </div>
              )}
              {fileType === 'video' && (
                <div className="preview-thumbnail video">
                  <video src={filePreview} muted />
                  <span className="video-badge">
                    <Video style={{ width: 12, height: 12 }} />
                  </span>
                </div>
              )}
              {fileType === 'file' && (
                <div className="preview-thumbnail generic-file">
                  <File />
                </div>
              )}
              <div className="preview-details">
                <span className="preview-name">{selectedFile.name}</span>
                <span className="preview-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
              </div>
              <button className="preview-remove-btn" onClick={handleClearFile} disabled={uploading}>
                <X />
              </button>
            </div>
            {uploading && (
              <div className="upload-progress-bar">
                <div className="upload-progress-fill"></div>
              </div>
            )}
          </div>
        )}

        <div className="chat-input-wrapper">
          <button
            type="button"
            className="attachment-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Attach Image or Video"
          >
            <Paperclip />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            accept="image/*,video/*"
          />

          <textarea
            ref={textareaRef}
            placeholder={
              uploading 
                ? 'Uploading file...' 
                : selectedFile 
                  ? 'Add a caption...' 
                  : `Message ${selectedUser.username}...`
            }
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={uploading}
            id="chat-message-input"
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={uploading || (!message.trim() && !selectedFile)}
            aria-label="Send message"
            id="send-message-btn"
          >
            {uploading ? (
              <div className="loading-spinner"></div>
            ) : (
              <Send />
            )}
          </button>
        </div>
      </div>
      </>
      ) : (
        <div className="not-connected-banner">
          <div className="not-connected-card animate-scale-in">
            <div className="not-connected-icon">
              <UserPlus />
            </div>
            <div className="not-connected-title">
              {selectedUser.friendStatus === 'pending_received'
                ? 'Connection Request Received'
                : 'Connect to Chat'}
            </div>
            <p className="not-connected-text">
              {selectedUser.friendStatus === 'none' &&
                `You must be connected to message ${selectedUser.username}. Send a connection request to start chatting.`}
              {selectedUser.friendStatus === 'pending_sent' &&
                `Connection request sent. You will be able to message ${selectedUser.username} once they accept your request.`}
              {selectedUser.friendStatus === 'pending_received' &&
                `${selectedUser.username} wants to connect with you. Accept the request to start messaging.`}
            </p>
            <div className="banner-action-group">
              {selectedUser.friendStatus === 'none' && (
                <button
                  className="btn-connect-banner"
                  onClick={() => onSendRequest(selectedUser._id)}
                >
                  <UserPlus /> Connect with {selectedUser.username}
                </button>
              )}
              {selectedUser.friendStatus === 'pending_sent' && (
                <div className="status-pending-banner">
                  <Clock /> Request Pending
                </div>
              )}
              {selectedUser.friendStatus === 'pending_received' && (
                <>
                  <button
                    className="btn-accept-banner"
                    onClick={() => onAcceptRequest(selectedUser.requestId)}
                  >
                    <Check /> Accept Request
                  </button>
                  <button
                    className="btn-decline-banner"
                    onClick={() => onRejectRequest(selectedUser.requestId)}
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {fullScreenImage && (
        <div className="image-lightbox" onClick={() => setFullScreenImage(null)}>
          <div className="lightbox-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <img src={fullScreenImage} alt="Full screen preview" />
            <button className="lightbox-close" onClick={() => setFullScreenImage(null)}>
              <X />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
