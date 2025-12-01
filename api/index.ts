/**
 * @fileoverview Connectify STUN Server - WebRTC signaling server using Socket.IO
 * This server facilitates peer-to-peer connections for video calling by handling
 * WebRTC signaling between clients in different rooms.
 * @author Connectify Team
 * @version 1.0.0
 */

import { Server } from "socket.io";

const PORT = 9000;

/**
 * Socket.IO server instance configured for WebRTC signaling
 * @constant {Server} io - The main Socket.IO server instance
 */
const io = new Server(PORT, {
  cors: { origin: "*" },
});

/**
 * Room management storage
 * Stores users by room ID, each user has an ID and display name
 * @type {Record<string, Array<{id: string, name: string}>>}
 */
const rooms: Record<string, { id: string; name: string }[]> = {};/**
 * Handle new client connections
 * Sets up WebRTC signaling for peer-to-peer video calls
 * @param {Socket} socket - The connected client socket
 */
io.on("connection", (socket) => {
  /**
   * Extract room ID from connection query parameters
   * @type {string} room - The room identifier the user wants to join
   */
  const room = socket.handshake.query.room as string;
  
  /**
   * Extract user display name from connection query parameters
   * @type {string} name - The user's display name, defaults to "Anonymous"
   */
  const name = (socket.handshake.query.name as string) || "Anonymous";

  // Reject connection if no room is specified
  if (!room) return;

  // Initialize room if it doesn't exist
  if (!rooms[room]) rooms[room] = [];

  // Send current users in room to the new user (excluding themselves)
  socket.emit("usersInRoom", rooms[room]);

  // Add new user to the room
  rooms[room].push({ id: socket.id, name });

  // Join the Socket.IO room for message broadcasting
  socket.join(room);

  // Notify all other users in the room about the new user
  socket.to(room).emit("newUserConnected", {
    id: socket.id,
    name,
  });
  console.log("User joined:", name, socket.id);  /**
   * Handle user disconnection
   * Removes user from room and notifies other users
   */
  socket.on("disconnect", () => {
    // Remove disconnected user from room
    rooms[room] = rooms[room].filter((u) => u.id !== socket.id);

    // Notify remaining users about the disconnection
    socket.to(room).emit("userDisconnected", { userId: socket.id });
  });

  /**
   * Handle WebRTC signaling between peers
   * Forwards ICE candidates, offers, and answers between clients
   * @param {Object} signalData - The signaling data
   * @param {string} signalData.to - Target socket ID to send signal to
   * @param {Object} signalData.data - WebRTC signaling data (offer/answer/candidate)
   */
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });
});
