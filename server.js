const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    homeName: "Time A",
    awayName: "Time B",
    homeScore: 0,
    awayScore: 0,
    homeColor: "#ff0000",
    awayColor: "#0000ff",
    gameTime: "00:00"
};

io.on('connection', (socket) => {
    console.log('Alguém conectou');
    socket.emit('updateOverlay', gameState);

    socket.on('updateGame', (data) => {
        gameState = data;
        io.emit('updateOverlay', gameState);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
