# 💬 ChatSphere — Real-Time Chat Application

A full-stack real-time chat application built with Node.js, Express, Socket.io, MongoDB, and React. Features JWT authentication, private messaging, online/offline status tracking, typing indicators, and read receipts.

---

## 🚀 Features

- **Secure Authentication** — JWT-based registration & login with bcrypt password hashing
- **Real-Time Messaging** — Private one-to-one messaging via Socket.io
- **Online/Offline Status** — Live user presence tracking with green/gray indicators
- **Typing Indicators** — See when someone is typing with animated dots
- **Read Receipts** — Single/double checkmarks for sent/read messages
- **Message History** — Persistent conversation storage with MongoDB
- **Responsive Design** — Works seamlessly on desktop and mobile
- **Modern Dark UI** — Premium teal/amber themed interface with glassmorphism

---

## 📋 Prerequisites

- **Node.js** v18+ 
- **MongoDB** (local or [MongoDB Atlas](https://www.mongodb.com/atlas))
- **npm** or **yarn**

---

## ⚙️ Setup Instructions

### 1. Clone / Navigate to the Project

```bash
cd chatsphere
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
# Edit .env file if needed (defaults work for local MongoDB)

# Start the development server
npm run dev
```

The backend will start at `http://localhost:5000`.

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will start at `http://localhost:5173`.

### 4. Open in Browser

Navigate to `http://localhost:5173`. Register two accounts in different browser tabs to test real-time messaging.

---

## 🔐 Environment Variables

Create a `.env` file in `backend/`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port |
| `MONGO_URI` | `mongodb://localhost:27017/chatsphere` | MongoDB connection string |
| `JWT_SECRET` | `chatsphere_super_secret_key_2024_xK9mP2nQ` | JWT signing secret |
| `JWT_EXPIRE` | `7d` | JWT token expiration |
| `NODE_ENV` | `development` | Environment mode |
| `CLIENT_URL` | `http://localhost:5173` | Frontend URL for CORS |

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register a new user | ❌ |
| POST | `/api/auth/login` | Login and get JWT | ❌ |
| POST | `/api/auth/logout` | Logout user | ✅ |
| GET | `/api/auth/verify` | Verify JWT token | ✅ |

### Users
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users` | Get all users | ✅ |
| GET | `/api/users/:id` | Get user by ID | ✅ |

### Messages
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/messages/:userId` | Get conversation with user | ✅ |
| POST | `/api/messages` | Send a message | ✅ |

### Socket.io Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `send-message` | Client → Server | Send a new message |
| `receive-message` | Server → Client | Receive a new message |
| `message-sent` | Server → Client | Message sent confirmation |
| `typing` | Client → Server | User started typing |
| `stop-typing` | Client → Server | User stopped typing |
| `user-typing` | Server → Client | Another user is typing |
| `user-stop-typing` | Server → Client | Another user stopped typing |
| `user-online` | Server → All | User came online |
| `user-offline` | Server → All | User went offline |
| `online-users` | Server → Client | List of online user IDs |
| `message-read` | Client → Server | Mark message as read |
| `message-read-receipt` | Server → Client | Read receipt notification |

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express.js |
| **Real-Time** | Socket.io |
| **Database** | MongoDB, Mongoose |
| **Auth** | JWT (jsonwebtoken), bcryptjs |
| **Frontend** | React 19, Vite |
| **Routing** | React Router v7 |
| **HTTP Client** | Axios |
| **Styling** | Vanilla CSS (custom design system) |
| **Notifications** | react-hot-toast |

---

## 📁 Project Structure

```
chatsphere/
├── backend/
│   ├── config/
│   │   └── db.js              # MongoDB connection
│   ├── controllers/
│   │   ├── authController.js  # Auth logic
│   │   ├── userController.js  # User queries
│   │   └── messageController.js # Message CRUD
│   ├── middleware/
│   │   └── authMiddleware.js  # JWT verification
│   ├── models/
│   │   ├── User.js            # User schema
│   │   ├── Message.js         # Message schema
│   │   └── Conversation.js   # Conversation schema
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   └── messageRoutes.js
│   ├── socket/
│   │   └── socketHandler.js   # Socket.io event handling
│   ├── .env                   # Environment variables
│   ├── server.js              # Entry point
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.jsx
│   │   │   ├── Signup.jsx
│   │   │   ├── ChatDashboard.jsx
│   │   │   ├── UserList.jsx
│   │   │   ├── ChatWindow.jsx
│   │   │   └── TypingIndicator.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── services/
│   │   │   ├── api.js         # Axios instance
│   │   │   └── socket.js     # Socket.io client
│   │   ├── utils/
│   │   │   └── ProtectedRoute.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css          # Design system
│   ├── index.html
│   └── package.json
│
└── README.md
```

---

## 🧪 Testing the Application

1. **Start MongoDB** — ensure it's running locally or use Atlas
2. **Start Backend** — `cd backend && npm run dev`
3. **Start Frontend** — `cd frontend && npm run dev`
4. **Register** two different users in separate browser tabs
5. **Login** with both accounts
6. **Select** a user from the sidebar and start chatting
7. **Observe** real-time message delivery, typing indicators, and online status

---

## 📄 License

MIT
