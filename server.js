const mongoose = require('mongoose');

// Conectar a MongoDB
mongoose.connect('mongodb+srv://Venator:Az302717@cluster0.ahup79z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log('Conectado a MongoDB');
        clearMessagesWhenClosed(); // Llamada para empezar a revisar el horario
    })
    .catch(err => console.error('Error al conectar con MongoDB:', err));

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

function clearMessagesWhenClosed() {
    setInterval(() => {
        if (!isWithinOperatingHours()) {
            Message.deleteMany({})
                .then(() => console.log('Historial de mensajes borrado por cierre de horario'))
                .catch(err => console.error('Error al borrar los mensajes:', err));
        }
    }, 60000); // Revisa cada 60 segundos si el chat está cerrado
}

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

const moment = require('moment-timezone');

function isWithinOperatingHours() {
    const now = moment().tz('America/Tijuana'); // Ajusta a la zona horaria de Buenos Aires (GMT-3)
    const startHour = 7; // Hora de inicio (9 AM)
    const endHour = 15; // Hora de cierre (6 PM)

    const currentHour = now.hours();  // Obtiene la hora en la zona horaria específica
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

            // Obtener los mensajes anteriores desde MongoDB
            Message.find().sort({ timestamp: 1 }).limit(50)  // Limita a los últimos 50 mensajes
                .then(messages => {
                    messages.forEach(msg => {
                        socket.emit('message', { username: msg.username, message: msg.message });
                    });
                })
                .catch(err => console.error('Error al obtener los mensajes:', err));

            broadcastUserList();
            console.log(`Usuario conectado: ${username}`);
        }
    });

    const Message = require('./models/message');  // Agrega esta línea al principio

    socket.on('message', (data) => {
        if (currentUser) {
            const newMessage = new Message({
                username: currentUser,
                message: data.message,
            });

            newMessage.save()
                .then(() => {
                    io.emit('message', { username: currentUser, message: data.message });
                })
                .catch(err => {
                    console.error('Error al guardar el mensaje:', err);
                });
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