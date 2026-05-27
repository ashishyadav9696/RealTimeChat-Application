import { useState, useMemo } from 'react';
import { Users, X, Search, Check, Plus } from 'lucide-react';

const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${url}`;
};

function GroupModal({ isOpen, onClose, users, onCreateGroup }) {
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Only show accepted friends
  const availableUsers = useMemo(() => {
    return users
      .filter(
        (u) =>
          u.friendStatus === 'accepted' &&
          u.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [users, searchQuery]);

  const toggleMember = (userId) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const removeMember = (userId) => {
    setSelectedMembers((prev) => prev.filter((id) => id !== userId));
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    setIsCreating(true);
    try {
      await onCreateGroup({
        name: groupName.trim(),
        members: selectedMembers,
      });
      // Reset
      setGroupName('');
      setSelectedMembers([]);
      setSearchQuery('');
      onClose();
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Users /> Create Group
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-input-group">
            <label>Group Name</label>
            <input
              type="text"
              placeholder="Enter group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value.slice(0, 50))}
              maxLength={50}
            />
            <span className="char-counter">{groupName.length}/50</span>
          </div>

          {selectedMembers.length > 0 && (
            <div className="selected-members">
              {selectedMembers.map((memberId) => {
                const user = users.find((u) => u._id === memberId);
                if (!user) return null;
                return (
                  <div key={memberId} className="member-chip">
                    {user.username}
                    <button onClick={() => removeMember(memberId)}>
                      <X />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="modal-input-group">
            <label>Add Members ({selectedMembers.length} selected)</label>
            <div className="search-input-wrapper" style={{ marginBottom: '8px' }}>
              <span className="search-icon"><Search /></span>
              <input
                type="text"
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="member-select-list">
            {availableUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                {searchQuery ? 'No friends found' : 'No connected friends yet'}
              </div>
            ) : (
              availableUsers.map((user) => {
                const isSelected = selectedMembers.includes(user._id);
                return (
                  <div
                    key={user._id}
                    className={`member-select-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleMember(user._id)}
                  >
                    <div className="checkbox">
                      {isSelected && <Check />}
                    </div>
                    <div className="user-avatar" style={{ width: '32px', height: '32px', minWidth: '32px', fontSize: '0.7rem' }}>
                      {user.profilePicture && (
                        <img 
                          src={getMediaUrl(user.profilePicture)} 
                          alt={user.username} 
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const fallback = e.target.parentElement.querySelector('.avatar-fallback');
                            if (fallback) fallback.style.display = 'inline-block';
                          }}
                        />
                      )}
                      <span 
                        className="avatar-fallback" 
                        style={{ display: user.profilePicture ? 'none' : 'inline-block' }}
                      >
                        {user.avatar || user.username.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="member-name">{user.username}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn-primary"
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedMembers.length === 0 || isCreating}
          >
            {isCreating ? (
              <>
                <span className="loading-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></span>
                Creating...
              </>
            ) : (
              <>
                <Plus /> Create Group
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GroupModal;
