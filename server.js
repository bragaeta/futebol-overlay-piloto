const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Estado do Jogo Completo
let gameState = {
    homeName: "CASA", awayName: "FORA",
    homeScore: 0, awayScore: 0,
    homeCrest: "", awayCrest: "",
    homeColor: "#c8102e", awayColor: "#003090", // Cores padrao
    gameTime: "00:00",
    matchId: null,
    homeLineup: [], // Lista de titulares casa
    awayLineup: [], // Lista de titulares fora
    events: []      // Lista de eventos (gols, cartoes)
};

// SUA CHAVE
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
    if (gameState.matchId) fetchGameData();
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
            // 1. Placar e Tempo
            gameState.homeScore = match.score.fullTime.home ?? match.score.halfTime.home ?? 0;
            gameState.awayScore = match.score.fullTime.away ?? match.score.halfTime.away ?? 0;
            
            let status = match.status;
            if(status === 'IN_PLAY') status = 'AO VIVO';
            if(status === 'PAUSED') status = 'INTERVALO';
            if(status === 'FINISHED') status = 'FIM';
            gameState.gameTime = status;

            // 2. Informações dos Times
            gameState.homeName = match.homeTeam.tla || match.homeTeam.shortName;
            gameState.awayName = match.awayTeam.tla || match.awayTeam.shortName;
            gameState.homeCrest = match.homeTeam.crest;
            gameState.awayCrest = match.awayTeam.crest;

            // 3. PROCESSAMENTO DE ESCALAÇÃO (LINEUP)
            // Se vier vazio da API, enviamos array vazio []
            gameState.homeLineup = [];
            gameState.awayLineup = [];
            
            if (match.homeTeam.lineup && match.homeTeam.lineup.length > 0) {
                gameState.homeLineup = match.homeTeam.lineup.map(player => {
                    return { number: player.shirtNumber, name: player.name };
                });
            }
            
            if (match.awayTeam.lineup && match.awayTeam.lineup.length > 0) {
                gameState.awayLineup = match.awayTeam.lineup.map(player => {
                    return { number: player.shirtNumber, name: player.name };
                });
            }

            // 4. PROCESSAMENTO DE EVENTOS (GOLS E CARTÕES)
            let rawEvents = [];

            // Pega Gols
            if(match.goals) {
                match.goals.forEach(goal => {
                    rawEvents.push({
                        minute: goal.minute,
                        type: 'goal',
                        text: `⚽ ${goal.scorer.name} (${goal.minute}')`,
                        teamId: goal.team.id
                    });
                });
            }

            // Pega Cartões (Se disponível no endpoint)
            if(match.bookings) {
                match.bookings.forEach(card => {
                    const icon = card.card === 'RED' ? '🟥' : '🟨';
                    rawEvents.push({
                        minute: card.minute,
                        type: 'card',
                        text: `${icon} ${card.player.name} (${card.minute}')`,
                        teamId: card.team.id
                    });
                });
            }

            // Ordena do mais recente para o mais antigo e pega os últimos 5
            rawEvents.sort((a, b) => b.minute - a.minute);
            gameState.events = rawEvents.slice(0, 5); // Apenas os top 5

            io.emit('updateOverlay', gameState);
            console.log(`Dados atualizados. Eventos: ${gameState.events.length}`);
        }
    } catch (error) {
        console.error("Erro API:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
