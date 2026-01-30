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
    homeName: "Aguardando...", awayName: "Aguardando...",
    homeScore: 0, awayScore: 0,
    homeColor: "#ff0000", awayColor: "#0000ff",
    gameTime: "00:00",
    matchId: null
};

// SUA CHAVE DIRETO NO CÓDIGO (Para teste)
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
        console.log(`Tentando buscar dados do jogo ${gameState.matchId} usando a chave iniciando em ${API_TOKEN.substring(0,4)}...`);
        
        const options = {
            method: 'GET',
            url: `https://api.football-data.org/v4/matches/${gameState.matchId}`,
            headers: {
                'X-Auth-Token': API_TOKEN.trim() // .trim() remove espaços invisíveis
            }
        };

        const response = await axios.request(options);
        const match = response.data;

        if (match) {
            const scoreHome = match.score.fullTime.home ?? match.score.halfTime.home ?? 0;
            const scoreAway = match.score.fullTime.away ?? match.score.halfTime.away ?? 0;
            
            gameState.homeScore = scoreHome;
            gameState.awayScore = scoreAway;
            
            let statusDisplay = match.status;
            if(match.status === 'IN_PLAY') statusDisplay = 'AO VIVO';
            if(match.status === 'PAUSED') statusDisplay = 'INTERVALO';
            if(match.status === 'FINISHED') statusDisplay = 'FIM';
            
            gameState.gameTime = statusDisplay;
            gameState.homeName = match.homeTeam.tla || match.homeTeam.shortName || "CASA";
            gameState.awayName = match.awayTeam.tla || match.awayTeam.shortName || "FORA";

            io.emit('updateOverlay', gameState);
            console.log(`SUCESSO! Placar atualizado: ${scoreHome} x ${scoreAway}`);
        }
    } catch (error) {
        // AQUI ESTÁ O SEGREDO DO DIAGNÓSTICO
        if (error.response) {
            console.error("ERRO DA API (Detalhado):", error.response.status, error.response.statusText);
            console.error("Mensagem da API:", JSON.stringify(error.response.data));
        } else {
            console.error("Erro de conexão:", error.message);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
