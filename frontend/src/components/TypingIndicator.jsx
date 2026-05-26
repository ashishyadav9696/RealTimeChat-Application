function TypingIndicator({ username }) {
  return (
    <div className="typing-indicator">
      <div className="typing-dots">
        <span className="typing-dot"></span>
        <span className="typing-dot"></span>
        <span className="typing-dot"></span>
      </div>
      <span className="typing-text">{username} is typing...</span>
    </div>
  );
}

export default TypingIndicator;
