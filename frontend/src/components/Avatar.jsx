import { useState } from 'react';

const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${url}`;
};

/**
 * Avatar component that properly handles profile picture display.
 * Uses React state to toggle between image and fallback — avoids the
 * brittle inline-style display hack that breaks on image load errors.
 *
 * Props:
 *   profilePicture  - URL or relative path of the profile photo
 *   avatar          - emoji/initials fallback text
 *   username        - used to generate initials if avatar is missing
 *   isOnline        - pass true/false to show status dot; omit/undefined to hide dot
 *   className       - additional classes on the wrapper div
 */
function Avatar({ profilePicture, avatar, username, isOnline, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false);

  const pictureUrl = getMediaUrl(profilePicture);
  const showImage = !!pictureUrl && !imgFailed;
  const fallback = avatar || (username ? username.substring(0, 2).toUpperCase() : '?');
  // Only show the status dot when isOnline prop is explicitly provided (true or false)
  const showDot = isOnline !== undefined;

  return (
    <div className={`user-avatar ${isOnline ? 'online' : ''} ${className}`.trim()}>
      {showImage ? (
        <img
          key={pictureUrl}
          src={pictureUrl}
          alt={username || 'User'}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="avatar-fallback">{fallback}</span>
      )}
      {showDot && (
        <span className={`user-status-dot ${isOnline ? 'online' : ''}`} />
      )}
    </div>
  );
}

export default Avatar;
