import { useState, useMemo } from 'react';
import { Search, Check, X, UserPlus, MessageCircle, Users, BellDot, Phone, PhoneMissed, ArrowUpRight, ArrowDownLeft, Video } from 'lucide-react';

const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${url}`;
};

function UserList({
  users,
  groups = [],
  callHistory = [],
  selectedUser,
  onSelectUser,
  onlineUsers,
  currentUser,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  unreadCounts = {},
  activeTab = 'chats',
  onTabChange,
  onOpenProfile,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let list = users.filter((user) =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Filter by tab
    if (activeTab === 'unreads') {
      list = list.filter((u) => (unreadCounts[u._id] || 0) > 0);
    }

    // Sort: online users first, then alphabetically
    list.sort((a, b) => {
      const aOnline = onlineUsers.includes(a._id);
      const bOnline = onlineUsers.includes(b._id);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      // Put unread conversations higher
      const aUnread = unreadCounts[a._id] || 0;
      const bUnread = unreadCounts[b._id] || 0;
      if (aUnread > 0 && bUnread === 0) return -1;
      if (aUnread === 0 && bUnread > 0) return 1;
      return a.username.localeCompare(b.username);
    });

    return list;
  }, [users, searchQuery, onlineUsers, activeTab, unreadCounts]);

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
      {/* Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => onTabChange('chats')}
        >
          <MessageCircle /> <span className="tab-label">Chats</span>
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => onTabChange('groups')}
        >
          <Users /> <span className="tab-label">Groups</span>
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'unreads' ? 'active' : ''}`}
          onClick={() => onTabChange('unreads')}
        >
          <BellDot /> <span className="tab-label">Unreads</span>
          {totalUnread > 0 && (
            <span className="tab-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
          )}
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'calls' ? 'active' : ''}`}
          onClick={() => onTabChange('calls')}
        >
          <Phone /> <span className="tab-label">Calls</span>
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <span className="search-icon"><Search /></span>
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
          {activeTab === 'chats' && `Messages · ${onlineCount} online`}
          {activeTab === 'groups' && 'Groups'}
          {activeTab === 'unreads' && `Unread · ${totalUnread}`}
          {activeTab === 'calls' && `Call History · ${callHistory.length}`}
        </div>

        {activeTab === 'groups' ? (
          groups.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: 'var(--text-muted)',
                fontSize: 'var(--font-sm)',
              }}
            >
              Use the + button to create a group
            </div>
          ) : (
            groups.map((group) => {
              const isActive = selectedUser?._id === group._id;
              return (
                <div
                  key={group._id}
                  className={`user-item ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectUser(group)}
                  role="button"
                  tabIndex={0}
                  id={`group-item-${group._id}`}
                >
                  <div className="user-avatar">
                    {group.avatar ? (
                      <img src={getMediaUrl(group.avatar)} alt={group.name} />
                    ) : (
                      group.name.substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="user-item-info">
                    <span className="user-item-name">{group.name}</span>
                    <span className="user-item-preview">
                      {group.members?.length || 0} members
                    </span>
                  </div>
                </div>
              );
            })
          )
        ) : activeTab === 'calls' ? (
          (() => {
            let filteredCalls = callHistory;
            if (searchQuery) {
              filteredCalls = filteredCalls.filter((call) => {
                const otherUser = call.sender?._id?.toString() === currentUser?._id?.toString() ? call.receiver : call.sender;
                return otherUser?.username?.toLowerCase().includes(searchQuery.toLowerCase());
              });
            }
            return filteredCalls.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 16px',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--font-sm)',
                }}
              >
                {searchQuery ? 'No calls found' : 'No call history yet'}
              </div>
            ) : (
              filteredCalls.map((call) => {
                const isOutgoing = call.sender?._id?.toString() === currentUser?._id?.toString();
                const isMissed = !isOutgoing && (call.content?.toLowerCase().includes('missed') || call.content?.toLowerCase().includes('declined'));
                const otherUser = isOutgoing ? call.receiver : call.sender;
                if (!otherUser) return null;

                const isVideo = call.content?.toLowerCase().includes('video');
                const durationMatch = call.content?.match(/\(([^)]+)\)/);
                const duration = durationMatch ? durationMatch[1] : null;

                return (
                  <div
                    key={call._id}
                    className="user-item call-item"
                    onClick={() => onSelectUser(otherUser)}
                    role="button"
                    tabIndex={0}
                    id={`call-item-${call._id}`}
                  >
                    <div className="user-avatar">
                      {otherUser.profilePicture && (
                        <img 
                          src={getMediaUrl(otherUser.profilePicture)} 
                          alt={otherUser.username} 
                          onError={(e) => {
                            e.target.style.display = 'none';
                            const fallback = e.target.parentElement.querySelector('.avatar-fallback');
                            if (fallback) fallback.style.display = 'inline-block';
                          }}
                        />
                      )}
                      <span 
                        className="avatar-fallback" 
                        style={{ display: otherUser.profilePicture ? 'none' : 'inline-block' }}
                      >
                        {otherUser.avatar || otherUser.username.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="user-item-info">
                      <span className="user-item-name">{otherUser.username}</span>
                      <div className="call-item-preview">
                        {isOutgoing ? (
                          <ArrowUpRight className="call-direction-icon outgoing" />
                        ) : isMissed ? (
                          <ArrowDownLeft className="call-direction-icon missed" />
                        ) : (
                          <ArrowDownLeft className="call-direction-icon incoming" />
                        )}
                        <span className="call-type-label">
                          {isOutgoing ? 'Outgoing' : isMissed ? 'Missed' : 'Incoming'} {isVideo ? 'Video' : 'Audio'}{' '}
                          {duration ? `(${duration})` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="call-item-time">
                      {formatLastSeen(call.createdAt)}
                    </div>
                  </div>
                );
              })
            );
          })()
        ) : filteredUsers.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: 'var(--text-muted)',
              fontSize: 'var(--font-sm)',
            }}
          >
            {searchQuery
              ? 'No users found'
              : activeTab === 'unreads'
              ? 'No unread messages'
              : 'No conversations yet'}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isOnline = onlineUsers.includes(user._id);
            const isActive = selectedUser?._id === user._id;
            const unread = unreadCounts[user._id] || 0;

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

                {unread > 0 && (
                  <div className="unread-badge">
                    {unread > 99 ? '99+' : unread}
                  </div>
                )}

                <div className="user-item-actions" onClick={(e) => e.stopPropagation()}>
                  {user.friendStatus === 'none' && (
                    <button
                      className="btn-connect-inline"
                      onClick={() => onSendRequest(user._id)}
                      title="Connect"
                    >
                      <UserPlus style={{ width: 12, height: 12, marginRight: 4 }} />
                      Connect
                    </button>
                  )}
                  {user.friendStatus === 'pending_sent' && (
                    <span className="status-requested-inline">Requested</span>
                  )}
                  {user.friendStatus === 'pending_received' && (
                    <div className="btn-group-inline">
                      <button
                        className="btn-accept-inline"
                        onClick={() => onAcceptRequest(user.requestId)}
                        title="Accept Request"
                      >
                        <Check />
                      </button>
                      <button
                        className="btn-decline-inline"
                        onClick={() => onRejectRequest(user.requestId)}
                        title="Decline Request"
                      >
                        <X />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Current user profile */}
      <div className="sidebar-profile" onClick={onOpenProfile}>
        <div className="user-avatar online">
          {currentUser?.profilePicture && (
            <img 
              src={getMediaUrl(currentUser.profilePicture)} 
              alt={currentUser?.username} 
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.parentElement.querySelector('.avatar-fallback');
                if (fallback) fallback.style.display = 'inline-block';
              }}
            />
          )}
          <span 
            className="avatar-fallback" 
            style={{ display: currentUser?.profilePicture ? 'none' : 'inline-block' }}
          >
            {currentUser?.avatar || currentUser?.username?.substring(0, 2).toUpperCase()}
          </span>
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
