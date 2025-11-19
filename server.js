const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, replace with your client URL
        methods: ["GET", "POST"]
    }
});

// Queue to store waiting users
let waitingQueue = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle finding a partner
    socket.on('find_partner', () => {
        console.log(`User ${socket.id} looking for partner`);

        if (waitingQueue.length > 0) {
            // Someone is already waiting, pair them up
            const partnerSocket = waitingQueue.shift();

            // Ensure we don't pair with self (edge case)
            if (partnerSocket.id === socket.id) {
                waitingQueue.push(socket);
                return;
            }

            const partnerId = partnerSocket.id;
            const myId = socket.id;

            console.log(`Pairing ${myId} with ${partnerId}`);

            // Emit 'partner_found' to both users
            // One must be the initiator for WebRTC (simple-peer)
            socket.emit('partner_found', { partnerId: partnerId, initiator: false });
            partnerSocket.emit('partner_found', { partnerId: myId, initiator: true });

        } else {
            // No one waiting, add to queue
            waitingQueue.push(socket);
            console.log(`User ${socket.id} added to queue`);
        }
    });

    // Handle signaling data (WebRTC Offer/Answer/ICE Candidates)
    socket.on('signal', (data) => {
        const { to, signal } = data;
        // Relay the signal to the specific partner
        io.to(to).emit('signal', { from: socket.id, signal });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove user from queue if they are waiting
        const index = waitingQueue.indexOf(socket);
        if (index !== -1) {
            waitingQueue.splice(index, 1);
            console.log(`User ${socket.id} removed from queue`);
        }

        // Note: In a real app, you might want to notify the connected partner 
        // that the peer disconnected, e.g., socket.to(partnerId).emit('peer_disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
