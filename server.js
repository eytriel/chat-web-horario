const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const activeUsers = new Set();

function broadcastUserList() {
    io.emit('user_list', Array.from(activeUsers));
}

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const startHour = 0;
const endHour = 24;

function isWithinOperatingHours() {
    const now = new Date();
    const currentHour = now.getHours();
    return currentHour >= startHour && currentHour < endHour;
}

io.on('connection', (socket) => {
    let currentUser = null;

    if (!isWithinOperatingHours()) {
        socket.emit('closed', 'El chat está cerrado en este momento.');
        socket.disconnect();
        return;
    }

    socket.on('login', (username) => {
        if (username.length > 15) {
            socket.emit('login_error', 'El nombre de usuario no puede tener más de 15 caracteres.');
            return;
        }

        if (activeUsers.has(username)) {
            socket.emit('login_error', 'Este nombre ya está en uso.');
        } else {
            currentUser = username;
            activeUsers.add(username);
            socket.emit('login_success');
            broadcastUserList();
            console.log(`Usuario conectado: ${username}`);
        }
    });

    socket.on('message', (data) => {
        if (currentUser) {
            io.emit('message', { username: currentUser, message: data.message });
        }
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            activeUsers.delete(currentUser);
            broadcastUserList(); // <-- Nuevo
            console.log(`Usuario desconectado: ${currentUser}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});