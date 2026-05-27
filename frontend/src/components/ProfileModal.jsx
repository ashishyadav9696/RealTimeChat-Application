import { useState, useRef } from 'react';
import { X, Camera, Mail, Calendar, User as UserIcon } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${url}`;
};

function ProfileModal({ isOpen, onClose, currentUser, onUpdateUser }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen || !currentUser) return null;

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('profilePicture', file);
      const response = await api.put('/users/profile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data.success) {
        toast.success('Profile picture updated!');
        if (onUpdateUser) {
          onUpdateUser(response.data.data);
        }
      }
    } catch (error) {
      toast.error('Failed to update profile picture');
    } finally {
      setUploading(false);
    }
  };

  const joinDate = currentUser.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>
            <UserIcon /> Profile
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="modal-body" style={{ alignItems: 'center' }}>
          <div className="profile-modal-avatar">
            <div className="user-avatar online">
              {currentUser.profilePicture ? (
                <img src={getMediaUrl(currentUser.profilePicture)} alt={currentUser.username} />
              ) : (
                currentUser.avatar || currentUser.username?.substring(0, 2).toUpperCase()
              )}
              <span className="user-status-dot online"></span>
            </div>
            <div
              className="edit-badge"
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              title="Change profile picture"
            >
              {uploading ? (
                <span className="loading-spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>
              ) : (
                <Camera />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
          </div>

          <div style={{ width: '100%' }}>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Username</span>
              <span className="profile-detail-value">{currentUser.username}</span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Email</span>
              <span className="profile-detail-value">{currentUser.email}</span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Joined</span>
              <span className="profile-detail-value">{joinDate}</span>
            </div>
            <div className="profile-detail-row">
              <span className="profile-detail-label">Status</span>
              <span className="profile-detail-value" style={{ color: 'var(--online)' }}>● Online</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileModal;
