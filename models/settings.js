const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    startHour: { type: Number, required: true },
    endHour: { type: Number, required: true }
});

module.exports = mongoose.model('Settings', settingsSchema);
