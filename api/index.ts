/**
 * @fileoverview Connectify STUN Server - WebRTC signaling server using Socket.IO
 * This server facilitates peer-to-peer connections for video calling by handling
 * WebRTC signaling between clients in different rooms.
 * @author Connectify Team
 * @version 1.0.1 (Corrected HTTP Request Handling)
 */

import { Server } from "socket.io";
import { createServer } from "http";
import 'dotenv/config';

// Asegúrate de que PORT esté definido en tu archivo .env
const PORT = Number(process.env.PORT || 9000); 

/**
 * HTTP server instance used as the foundation for the Socket.IO server.
 * @type {import('http').Server}
 */
const httpServer = createServer();

/**
 * Socket.IO server instance configured for WebRTC signaling
 * @constant {Server} io - The main Socket.IO server instance
 */
const io = new Server(httpServer, {
  cors: { origin: "*" },
  // Puedes omitir 'allowEIO3: true' a menos que necesites compatibilidad
  // con clientes muy antiguos de Socket.IO.
  allowEIO3: true,
});


/**
 * Room management storage
 * Stores users by room ID, each user has an ID and display name
 * @type {Record<string, Array<{id: string, name: string}>>}
 */
const rooms: Record<string, { id: string; name: string }[]> = {};

// -------------------------------------------------------------------
// Socket.IO Signaling Logic
// -------------------------------------------------------------------

/**
 * Handle new client connections
 * Sets up WebRTC signaling for peer-to-peer video calls
 * @param {Socket} socket - The connected client socket
 */
io.on("connection", (socket) => {
  /**
   * Extract room ID from connection query parameters
   */
  const room = socket.handshake.query.room as string;

  /**
   * Extract user display name from connection query parameters
   */
  const name = (socket.handshake.query.name as string) || "Anonymous";

  // Reject connection if no room is specified
  if (!room) {
    console.log(`Connection rejected for ${socket.id}: No room specified.`);
    return socket.disconnect();
  }

  // Initialize room if it doesn't exist
  if (!rooms[room]) rooms[room] = [];

  // 1. Send current users in room to the new user (excluding themselves)
  socket.emit("usersInRoom", rooms[room]);

  // 2. Add new user to the room
  rooms[room].push({ id: socket.id, name });

  // 3. Join the Socket.IO room for message broadcasting
  socket.join(room);

  // 4. Notify all other users in the room about the new user
  socket.to(room).emit("newUserConnected", {
    id: socket.id,
    name,
  });
  console.log(`User joined room '${room}': ${name} (${socket.id})`);

  /**
   * Handle user disconnection
   */
  socket.on("disconnect", () => {
    if (rooms[room]) {
      // Remove disconnected user from room
      rooms[room] = rooms[room].filter((u) => u.id !== socket.id);

      // Notify remaining users about the disconnection
      socket.to(room).emit("userDisconnected", { userId: socket.id });
      console.log(`User disconnected from room '${room}': ${name} (${socket.id})`);

      // Opcional: Limpiar la sala si se queda vacía
      if (rooms[room].length === 0) {
        delete rooms[room];
        console.log(`Room '${room}' cleared.`);
      }
    }
  });

  /**
   * Handle WebRTC signaling between peers
   */
  socket.on("signal", ({ to, data }) => {
    // Reenviar el objeto de señalización al socket de destino
    io.to(to).emit("signal", { from: socket.id, data });
  });
});

// -------------------------------------------------------------------
// HTTP Request Handling (Health Check & 404)
// -------------------------------------------------------------------

/**
 * HTTP request handler for health check and basic routing.
 * **CORRECCIÓN:** Asegura que las solicitudes de Socket.IO no sean interceptadas
 * y respondidas con un 404.
 * * @param {import('http').IncomingMessage} req - The HTTP request object
 * @param {import('http').ServerResponse} res - The HTTP response object
 */
httpServer.on("request", (req, res) => {
  // **CLAVE DE CORRECCIÓN:** Permitir que Socket.IO/Engine.io maneje sus propias rutas.
  // Por defecto, Engine.io usa la ruta /socket.io/
  if (req.url && req.url.startsWith("/socket.io/")) {
    return; // Dejar que el servidor Socket.IO interno maneje esta solicitud.
  }

  // Manejar rutas de health check y root
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "stun-server", PORT }));
    return;
  }

  // 404 para todas las demás rutas NO manejadas por Socket.IO o los checks anteriores
  res.writeHead(404);
  res.end();
});

// -------------------------------------------------------------------
// Server Startup and Error Handling
// -------------------------------------------------------------------

/**
 * HTTP server error handler.
 */
httpServer.on("error", (error: any) => {
  console.error("❌ HTTP Server error:", error);
  if (error.code === "EADDRINUSE") {
    console.error(`   Port ${PORT} is already in use`);
    // Opcional: Terminar el proceso si el puerto está en uso
    process.exit(1);
  }
});

/**
 * Start the HTTP server
 */
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Stun server running on port ${PORT}`);
});