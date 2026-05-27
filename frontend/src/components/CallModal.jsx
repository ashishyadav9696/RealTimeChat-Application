import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';

const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${url}`;
};

function CallModal({
  callState,
  onAccept,
  onReject,
  onEnd,
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  onToggleMute,
  onToggleVideo
}) {
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Call states: 'outgoing', 'incoming', 'connected', 'ended'
  const { status, callType, userName, userAvatar, profilePicture } = callState;

  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  useEffect(() => {
    if (status === 'ended') {
      if (timerRef.current) clearInterval(timerRef.current);
      // Auto-close after 2 seconds
      const timeout = setTimeout(() => {
        onEnd();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [status, onEnd]);

  // Bind streams to video tags
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const getStatusText = () => {
    switch (status) {
      case 'outgoing': return 'Calling...';
      case 'incoming': return `Incoming ${callType} call`;
      case 'connected': return callType === 'video' ? 'Video call' : 'Audio call';
      case 'ended': return 'Call ended';
      default: return '';
    }
  };

  const avatarContent = (
    <>
      {profilePicture && (
        <img 
          src={getMediaUrl(profilePicture)} 
          alt={userName} 
          onError={(e) => {
            e.target.style.display = 'none';
            const fallback = e.target.parentElement.querySelector('.avatar-fallback');
            if (fallback) fallback.style.display = 'inline-block';
          }}
        />
      )}
      <span 
        className="avatar-fallback" 
        style={{ display: profilePicture ? 'none' : 'inline-block' }}
      >
        {userAvatar || userName?.substring(0, 2).toUpperCase()}
      </span>
    </>
  );

  return (
    <div className="call-overlay">
      {/* WebRTC Video Feeds */}
      {status === 'connected' && remoteStream && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={callType === 'video' ? 'remote-video' : 'remote-audio-only'}
          style={callType === 'audio' ? { display: 'none' } : {}}
        />
      )}

      {status === 'connected' && localStream && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={callType === 'video' ? 'local-video-preview' : 'local-audio-only'}
          style={(callType === 'audio' || isVideoOff) ? { display: 'none' } : {}}
        />
      )}

      {/* Traditional Call UI Elements (Hidden or overlaid over Video Call) */}
      {(status !== 'connected' || callType === 'audio' || isVideoOff) && (
        <div className="call-avatar-container">
          {(status === 'outgoing' || status === 'incoming') && (
            <>
              <div className="call-ring"></div>
              <div className="call-ring"></div>
              <div className="call-ring"></div>
            </>
          )}
          <div className="call-avatar">
            {avatarContent}
          </div>
        </div>
      )}

      <div className="call-info">
        <div className="call-name">{userName}</div>
        <div className="call-status">{getStatusText()}</div>
        {status === 'connected' && (
          <div className="call-timer">{formatTimer(timer)}</div>
        )}
      </div>

      <div className="call-controls">
        {status === 'incoming' ? (
          <>
            <button
              className="call-control-btn end-call"
              onClick={onReject}
              title="Decline"
            >
              <PhoneOff />
            </button>
            <button
              className="call-control-btn accept-call"
              onClick={onAccept}
              title="Accept"
            >
              <Phone />
            </button>
          </>
        ) : status === 'connected' ? (
          <>
            <button
              className={`call-control-btn ${isMuted ? 'active' : ''}`}
              onClick={onToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff /> : <Mic />}
            </button>
            {callType === 'video' && (
              <button
                className={`call-control-btn ${isVideoOff ? 'active' : ''}`}
                onClick={onToggleVideo}
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? <VideoOff /> : <Video />}
              </button>
            )}
            <button
              className="call-control-btn end-call"
              onClick={onEnd}
              title="End call"
            >
              <PhoneOff />
            </button>
            <button className="call-control-btn" title="Speaker">
              <Volume2 />
            </button>
          </>
        ) : status === 'outgoing' ? (
          <button
            className="call-control-btn end-call"
            onClick={onEnd}
            title="Cancel call"
          >
            <PhoneOff />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default CallModal;
