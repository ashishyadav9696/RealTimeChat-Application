import { useState, useMemo } from 'react';

function UserList({ users, selectedUser, onSelectUser, onlineUsers, currentUser }) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let list = users.filter((user) =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort: online users first, then alphabetically
    list.sort((a, b) => {
      const aOnline = onlineUsers.includes(a._id);
      const bOnline = onlineUsers.includes(b._id);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return a.username.localeCompare(b.username);
    });

    return list;
  }, [users, searchQuery, onlineUsers]);

  const onlineCount = users.filter((u) => onlineUsers.includes(u._id)).length;

  const formatLastSeen = (date) => {
    if (!date) return '';
    const now = new Date();
    const lastSeen = new Date(date);
    const diff = now - lastSeen;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return lastSeen.toLocaleDateString();
  };

  return (
    <>
      {/* Search */}
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="user-search-input"
          />
        </div>
      </div>

      {/* User list */}
      <div className="user-list">
        <div className="user-list-section-title">
          Messages · {onlineCount} online
        </div>

        {filteredUsers.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: 'var(--text-muted)',
              fontSize: 'var(--font-sm)',
            }}
          >
            {searchQuery ? 'No users found' : 'No conversations yet'}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isOnline = onlineUsers.includes(user._id);
            const isActive = selectedUser?._id === user._id;

            return (
              <div
                key={user._id}
                className={`user-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectUser(user)}
                role="button"
                tabIndex={0}
                id={`user-item-${user._id}`}
              >
                <div className={`user-avatar ${isOnline ? 'online' : ''}`}>
                  {user.avatar || user.username.substring(0, 2).toUpperCase()}
                  <span
                    className={`user-status-dot ${isOnline ? 'online' : ''}`}
                  ></span>
                </div>

                <div className="user-item-info">
                  <span className="user-item-name">{user.username}</span>
                  <span className="user-item-preview">
                    {isOnline ? 'Online' : formatLastSeen(user.lastSeen)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Current user profile */}
      <div className="sidebar-profile">
        <div className="user-avatar online">
          {currentUser?.avatar ||
            currentUser?.username?.substring(0, 2).toUpperCase()}
          <span className="user-status-dot online"></span>
        </div>
        <div className="sidebar-profile-info">
          <div className="sidebar-profile-name">{currentUser?.username}</div>
          <div className="sidebar-profile-status">● Online</div>
        </div>
      </div>
    </>
  );
}

export default UserList;
