const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Estado do Jogo (Agora super completo)
let gameState = {
    homeName: "Aguardando...", awayName: "Aguardando...",
    homeScore: 0, awayScore: 0,
    homeCrest: "", awayCrest: "",
    homeColor: "#ff0000", awayColor: "#0000ff",
    gameTime: "00:00",
    matchId: null,
    // Novas listas
    homeLineup: [], 
    awayLineup: [],
    goals: [] // Lista de quem fez gol
};

const API_TOKEN = "4aa1bd59062744a78c557039bf31b530"; 

io.on('connection', (socket) => {
    socket.emit('updateOverlay', gameState);

    socket.on('trackMatch', (id) => {
        console.log("Rastreando jogo ID:", id);
        gameState.matchId = id;
        fetchGameData();
    });

    socket.on('updateGame', (data) => {
        gameState = { ...gameState, ...data };
        io.emit('updateOverlay', gameState);
    });
