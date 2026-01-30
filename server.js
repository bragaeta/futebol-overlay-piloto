const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Estado do Jogo (Agora com Listas de Jogadores)
let gameState = {
    homeName: "Aguardando...", awayName: "Aguardando...",
    homeScore: 0, awayScore: 0,
    homeCrest: "", awayCrest: "",
    homeColor: "#ff0000", awayColor: "#0000ff",
    gameTime: "00:00",
    matchId: null,
    // Novas listas vazias para evitar erro se a API falhar
    homeLineup: [], 
    awayLineup: []
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
});

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
            url: `https://api.football-data.org/v4/matches/${gameState.matchId}`,
            headers: { 'X-Auth-Token': API_TOKEN.trim() }
        };

        const response = await axios.request(options);
        const match = response.data;

        if (match) {
            // Placar e Tempo
            gameState.homeScore = match.score.fullTime.home ?? match.score.halfTime.home ?? 0;
            gameState.awayScore = match.score.fullTime.away ?? match.score.halfTime.away ?? 0;
            
            let statusDisplay = match.status;
            if(match.status === 'IN_PLAY') statusDisplay = 'AO VIVO';
            if(match.status === 'PAUSED') statusDisplay = 'INTERVALO';
            if(match.status === 'FINISHED') statusDisplay = 'FIM';
            gameState.gameTime = statusDisplay;
            
            // Nomes e Escudos
            gameState.homeName = match.homeTeam.tla || match.homeTeam.shortName || "CASA";
            gameState.awayName = match.awayTeam.tla || match.awayTeam.shortName || "FORA";
            gameState.homeCrest = match.homeTeam.crest; 
            gameState.awayCrest = match.awayTeam.crest;

            // --- LÓGICA DAS ESCALAÇÕES (LINEUPS) ---
            // A API manda tudo misturado, precisamos separar Casa e Fora
            if (match.homeTeam.id && match.awayTeam.id) {
                // Tenta achar a escalação na resposta (nem sempre vem no plano free)
                // Nota: Nessa API específica, as vezes lineups ficam em outro endpoint,
                // mas vamos tentar pegar o básico se estiver disponível.
                // Se estiver vazio, vamos manter vazio para não quebrar.
            }

            io.emit('updateOverlay', gameState);
            console.log(`Atualizado! Placar: ${gameState.homeScore} x ${gameState.awayScore}`);
        }
    } catch (error) {
        console.error("Erro API:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
