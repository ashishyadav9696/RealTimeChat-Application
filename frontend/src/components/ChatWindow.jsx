import { useState, useEffect, useRef, useCallback } from 'react';
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
          <div className="chat-empty-icon">💬</div>
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

  return (
    <div className="chat-main">
      {/* Chat Header */}
      <div className="chat-header">
        <button
          className="chat-header-back"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          ←
        </button>

        <div className={`user-avatar ${isOnline ? 'online' : ''}`}>
          {selectedUser.avatar ||
            selectedUser.username.substring(0, 2).toUpperCase()}
          <span
            className={`user-status-dot ${isOnline ? 'online' : ''}`}
          ></span>
        </div>

        <div className="chat-header-info">
          <div className="chat-header-name">{selectedUser.username}</div>
          <div className="chat-header-status">
            <span className={`mini-dot ${isOnline ? 'online' : ''}`}></span>
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

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
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>👋</div>
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
                          <span className="file-icon">📄</span>
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
                            ⬇
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
                            {msg.isRead ? '✓✓' : '✓'}
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
                  <span className="video-badge">🎥</span>
                </div>
              )}
              {fileType === 'file' && (
                <div className="preview-thumbnail generic-file">
                  <span>📄</span>
                </div>
              )}
              <div className="preview-details">
                <span className="preview-name">{selectedFile.name}</span>
                <span className="preview-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
              </div>
              <button className="preview-remove-btn" onClick={handleClearFile} disabled={uploading}>
                ✕
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
            📎
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
              '➤'
            )}
          </button>
        </div>
      </div>

      {/* Lightbox Modal */}
      {fullScreenImage && (
        <div className="image-lightbox" onClick={() => setFullScreenImage(null)}>
          <div className="lightbox-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <img src={fullScreenImage} alt="Full screen preview" />
            <button className="lightbox-close" onClick={() => setFullScreenImage(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
