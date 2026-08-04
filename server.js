const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const path = require("path");
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const initSocket = require("./sockets/socketHandler");

dotenv.config(); // Load variables from .env

const app = express();

// Connect to MongoDB
connectDB();

// Middleware to parse incoming JSON requests
app.use(express.json());

// Serve static frontend files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// Simple test route to confirm the server is working
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Authentication routes (register/login)
app.use("/api/auth", authRoutes);

// Chat routes (send message, get history)
 app.use("/api/chat", chatRoutes);

// Error handling middleware (must be after all routes)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Wrap Express in a plain HTTP server so Socket.io can attach to it
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Fine for local development; restrict this in production
  },
});

initSocket(io);

// Make io available inside REST controllers (e.g. req.app.get("io"))
app.set("io", io);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});