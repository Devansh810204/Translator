const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Join Room Logic
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        // Notify others in the room
        socket.to(roomId).emit('user-connected', userId);

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });

    // 2. WebRTC Signaling (Video Connection)
    socket.on('offer', (data) => socket.broadcast.emit('offer', data));
    socket.on('answer', (data) => socket.broadcast.emit('answer', data));
    socket.on('ice-candidate', (data) => socket.broadcast.emit('ice-candidate', data));

    // 3. Translation Data Transfer
    socket.on('speak-data', (data) => {
        // Broadcast the text to the other person
        socket.broadcast.to(data.roomId).emit('receive-speak-data', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Access from other devices: http://YOUR_LOCAL_IP:${PORT}`);
    console.log(`For mobile devices: Use Chrome and enable 'Insecure content' in settings`);
});
