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
    homeName: "CASA", awayName: "FORA",
    homeScore: 0, awayScore: 0,
    homeCrest: "", awayCrest: "",
    homeColor: "#c8102e", awayColor: "#003090",
    gameTime: "00:00",
    matchId: null,
    homeLineup: [], 
    awayLineup: [],
    events: []
};

// SUA CHAVE
const API_TOKEN = "4aa1bd59062744a78c557039bf31b530"; 

io.on('connection', (socket) => {
    // Envia estado atual ao conectar
    socket.emit('updateOverlay', gameState);

    // 1. Rastrear um jogo específico
    socket.on('trackMatch', (id) => {
        console.log("Rastreando jogo ID:", id);
        gameState.matchId = id;
        fetchGameData();
    });

    // 2. Buscar jogos do dia (NOVO)
    socket.on('searchMatches', async () => {
        console.log("Buscando jogos de hoje...");
        const matches = await listMatches();
        socket.emit('matchesFound', matches);
    });

    // 3. Atualização Manual
    socket.on('updateGame', (data) => {
        gameState = { ...gameState, ...data };
        io.emit('updateOverlay', gameState);
    });
});

// Loop de atualização (15s)
setInterval(() => {
    if (gameState.matchId) fetchGameData();
}, 15000);

// --- FUNÇÃO DE BUSCAR JOGOS DO DIA ---
async function listMatches() {
    try {
        // Pega data de hoje (YYYY-MM-DD)
        const today = new Date().toISOString().split('T')[0];
        
        const options = {
            method: 'GET',
            // Busca jogos de hoje para as principais ligas
            url: `https://api.football-data.org/v4/matches?dateFrom=${today}&dateTo=${today}`,
            headers: { 'X-Auth-Token': API_TOKEN.trim() }
        };

        const response = await axios.request(options);
        // Filtra apenas jogos agendados ou rolando
        return response.data.matches || [];
    } catch (error) {
        console.error("Erro ao listar jogos:", error.message);
        return [];
    }
}

// --- FUNÇÃO DE DADOS DO JOGO ---
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
            // Placar
            gameState.homeScore = match.score.fullTime.home ?? match.score.halfTime.home ?? 0;
            gameState.awayScore = match.score.fullTime.away ?? match.score.halfTime.away ?? 0;
            
            // Status
            let status = match.status;
            if(status === 'IN_PLAY') status = 'AO VIVO';
            if(status === 'PAUSED') status = 'INTERVALO';
            if(status === 'FINISHED') status = 'FIM';
            gameState.gameTime = status;

            // Times
            gameState.homeName = match.homeTeam.tla || match.homeTeam.shortName;
            gameState.awayName = match.awayTeam.tla || match.awayTeam.shortName;
            gameState.homeCrest = match.homeTeam.crest;
            gameState.awayCrest = match.awayTeam.crest;

            // Escalações
            gameState.homeLineup = [];
            gameState.awayLineup = [];
            if (match.homeTeam.lineup) {
                gameState.homeLineup = match.homeTeam.lineup.map(p => ({ number: p.shirtNumber, name: p.name }));
            }
            if (match.awayTeam.lineup) {
                gameState.awayLineup = match.awayTeam.lineup.map(p => ({ number: p.shirtNumber, name: p.name }));
            }

            // Eventos
            let rawEvents = [];
            if(match.goals) {
                match.goals.forEach(g => rawEvents.push({ 
                    minute: g.minute, type: 'goal', text: `⚽ ${g.scorer.name} (${g.minute}')` 
                }));
            }
            if(match.bookings) {
                match.bookings.forEach(c => {
                    const icon = c.card === 'RED' ? '🟥' : '🟨';
                    rawEvents.push({ minute: c.minute, type: 'card', text: `${icon} ${c.player.name} (${c.minute}')` });
                });
            }
            rawEvents.sort((a, b) => b.minute - a.minute);
            gameState.events = rawEvents.slice(0, 5);

            io.emit('updateOverlay', gameState);
            console.log(`Jogo ${gameState.matchId} atualizado.`);
        }
    } catch (error) {
        console.error("Erro API Jogo:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
