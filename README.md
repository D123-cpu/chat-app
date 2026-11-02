# ChatApp

A real-time one-to-one chat application with secure authentication and persistent message history.

## Features
- User registration and login (bcrypt + JWT)
- Real-time messaging with Socket.io
- Message history stored in MongoDB
- Online/offline status and last seen
- Typing indicator
- Sent / delivered / seen message ticks
- Unread message badges
- Dark mode and responsive UI

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Real-time:** Socket.io
- **Auth:** JSON Web Tokens, bcryptjs
- **Frontend:** HTML, CSS, JavaScript

## Project Structure
```
config/        Database connection
controllers/   Request logic (auth, chat)
middleware/    JWT protection, error handling
models/        User, Message, Conversation schemas
routes/        API endpoints
sockets/       Socket.io event handlers
public/        Frontend (HTML, CSS, JS)
server.js      Entry point
```

## Getting Started

1. Clone the repo and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd chat-app
   npm install
   ```

2. Create a `.env` file in the root:
   ```
   PORT=5000
   MONGO_URI=mongodb://127.0.0.1:27017/chat-app
   JWT_SECRET=your_secret_key
   ```

3. Start MongoDB, then run:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5000`. Use two browser windows (one incognito) with different accounts to test chat.

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Log in |
| GET | `/api/chat/users` | Yes | List users |
| GET | `/api/chat/unread-counts` | Yes | Unread counts per sender |
| GET | `/api/chat/history/:receiverId` | Yes | Chat history |
| POST | `/api/chat/send` | Yes | Send message (REST fallback) |

## License
MIT
