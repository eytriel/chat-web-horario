const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

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
    if (!isWithinOperatingHours()) {
        socket.emit('closed', 'El chat está cerrado en este momento.');
        socket.disconnect();
        return;
    }

    socket.on('message', (data) => {
        io.emit('message', data);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});