const mongoose = require('mongoose');
const Settings = require('./models/settings');
const Message = require('./models/message'); // AGREGADO: Requerir el modelo Message

let dynamicStartHour = 7;
let dynamicEndHour = 15;

mongoose.connect('mongodb+srv://Venator:Az302717@cluster0.ahup79z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('Conectado a MongoDB');

        const config = await Settings.findOne();
        if (config) {
            dynamicStartHour = config.startHour;
            dynamicEndHour = config.endHour;
        } else {
            await Settings.create({ startHour: 7, endHour: 15 }); // Valor por defecto
        }

        clearMessagesWhenClosed(); // Se activa después de obtener horarios
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
app.use(express.json());

// Rutas API para configuración de horarios
app.get('/api/settings', async (req, res) => {
    const config = await Settings.findOne();
    res.json(config);
});

app.post('/api/settings', async (req, res) => {
    const { startHour, endHour } = req.body;
    await Settings.findOneAndUpdate({}, { startHour, endHour });

    dynamicStartHour = startHour;
    dynamicEndHour = endHour;

    res.json({ message: 'Horarios actualizados' });
});

const PORT = process.env.PORT || 3000;
// Eliminá las siguientes líneas para evitar confusión:
// const startHour = 0;
// const endHour = 24;

const moment = require('moment-timezone');

function isWithinOperatingHours() {
    const now = moment().tz('America/Tijuana');
    const currentHour = now.hours();
    return currentHour >= dynamicStartHour && currentHour < dynamicEndHour;
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

            // Obtener los mensajes anteriores desde MongoDB, ahora con un límite mayor (200)
            Message.find().sort({ timestamp: 1 }).limit(200)
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

    // Nuevo manejador para que el admin pueda solicitar la lista actual de usuarios
    socket.on('get_user_list', () => {
        socket.emit('user_list', Array.from(activeUsers));
    });

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
            broadcastUserList();
            console.log(`Usuario desconectado: ${currentUser}`);
        }
    });
});


server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
