import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import { getMessages, saveMessage } from "./controllers/messageController.js";
import protect from "./middleware/authMiddleware.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const httpServer = createServer(app);

// Настройка middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// avatars
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API маршруты
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Что-то пошло не так!",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL, // Client url
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);

// Хранилище для онлайн пользователей
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("user_connected", (userData) => {
    onlineUsers.set(socket.id, userData);
    io.emit("users_online", Array.from(onlineUsers.values()));
  });

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`User joined room: ${roomId}`);
  });

  socket.on("send_message", async (data) => {
    try {
      const messageData = {
        sender: data.userId,
        senderUsername: data.sender,
        content: data.content,
        roomId: data.roomId,
      };

      const savedMessage = await saveMessage(messageData);
      if (savedMessage) {
        io.to(data.roomId).emit("receive_message", {
          ...data,
          _id: savedMessage._id,
          createdAt: savedMessage.createdAt,
        });
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    io.emit("users_online", Array.from(onlineUsers.values()));
    console.log("User disconnected:", socket.id);
  });
});

// Connect to MongoDB
connectDB()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  });
