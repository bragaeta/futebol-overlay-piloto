const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Estado do Jogo
let gameState = {
    homeName: "Time A", awayName: "Time B",
    homeScore: 0, awayScore: 0,
    homeColor: "#ff0000", awayColor: "#0000ff",
    gameTime: "00:00",
    matchId: null
};

// --- AQUI ESTÁ A SOLUÇÃO ---
// Estou colocando sua chave direto aqui para destravar o teste
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
});

// Busca a cada 15 segundos
setInterval(() => {
    if (gameState.matchId) {
        fetchGameData();
    }
}, 15000);

async function fetchGameData() {
    if (!gameState.matchId) return;

    try {
        const options = {
            method: 'GET',
            // URL da Football-Data.org
            url: `https://api.football-data.org/v4/matches/${gameState.matchId}`,
            headers: {
                'X-Auth-Token': API_TOKEN 
            }
        };

        const response = await axios.request(options);
        const match = response.data;

        if (match) {
            // Lógica para ler os dados
            const scoreHome = match.score.fullTime.home ?? match.score.halfTime.home ?? 0;
            const scoreAway = match.score.fullTime.away ?? match.score.halfTime.away ?? 0;
            
            gameState.homeScore = scoreHome;
            gameState.awayScore = scoreAway;
            
            // Tratamento do tempo de jogo
            let statusDisplay = match.status;
            if(match.status === 'IN_PLAY') statusDisplay = 'AO VIVO';
            if(match.status === 'PAUSED') statusDisplay = 'INTERVALO';
            if(match.status === 'FINISHED') statusDisplay = 'FIM';
            
            gameState.gameTime = statusDisplay;
            
            gameState.homeName = match.homeTeam.shortName || match.homeTeam.name;
            gameState.awayName = match.awayTeam.shortName || match.awayTeam.name;

            io.emit('updateOverlay', gameState);
            console.log(`Atualizado: ${gameState.homeScore} x ${gameState.awayScore} (${statusDisplay})`);
        }
    } catch (error) {
        // Log detalhado para sabermos o erro
        console.error("Erro na API:", error.response ? error.response.status : error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
