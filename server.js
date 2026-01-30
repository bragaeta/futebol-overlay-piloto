const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const API_KEY = "78cfaff5-5122-4990-9112-5dc1d12a6179";
const BASE_URL = "https://spro.agency/api";

let gameState = {
    homeName: "CASA", awayName: "FORA",
    homeScore: 0, awayScore: 0,
    homeCrest: "", awayCrest: "",
    gameTime: "00:00",
    matchId: null
};

let matchesCache = [];

io.on('connection', (socket) => {
    socket.emit('updateOverlay', gameState);

    socket.on('trackMatch', (id) => {
        console.log("Rastreando:", id);
        gameState.matchId = id;
        fetchGameData(true);
    });

    socket.on('searchMatches', async () => {
        const matches = await listMatches();
        socket.emit('matchesFound', matches);
    });

    socket.on('updateGame', (data) => {
        gameState = { ...gameState, ...data };
        io.emit('updateOverlay', gameState);
    });
});

setInterval(() => {
    if (gameState.matchId) fetchGameData();
}, 15000); 

// --- 1. BUSCA E FILTRA JOGOS DE HOJE ---
async function listMatches() {
    try {
        console.log("Buscando lista na API...");
        const response = await axios.get(`${BASE_URL}/get_games`, {
            params: { key: API_KEY }
        });

        let data = response.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            data = Object.values(data);
        }
        if (!Array.isArray(data)) return [];

        // --- FILTRO DE DATA (HOJE) ---
        // Pega a data atual no formato YYYY-MM-DD
        // Nota: O servidor Render usa UTC. Isso é bom para comparar com a API.
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayString = `${year}-${month}-${day}`; // Ex: "2026-01-30"

        console.log(`Filtrando jogos para data: ${todayString}`);

        const todaysMatches = data.filter(m => {
            // A API manda "when": "2026-01-30, 07:00 PM"
            // Verificamos se começa com a data de hoje
            return (m.when && m.when.startsWith(todayString)) &&
                   (!m.sport || (!m.sport.includes('UFC') && !m.sport.includes('Boxing')));
        });

        matchesCache = todaysMatches; // Guarda só os de hoje no cache

        return todaysMatches.map(event => {
            let home = "Casa", away = "Fora";
            if (event.orig_teams && event.orig_teams.includes(' vs ')) {
                const parts = event.orig_teams.split(' vs ');
                home = parts[0].trim(); away = parts[1].trim();
            } else if (event.game && event.game.includes(' vs ')) {
                const parts = event.game.split(' vs ');
                home = parts[0].trim(); away = parts[1].split(',')[0].trim();
            }

            return {
                id: event.universal_id || event.id, 
                // Enviamos a string original "2026-01-30, 07:00 PM" para o front tratar o fuso
                utcDate: event.when, 
                competition: { name: event.sport || "Esporte" },
                homeTeam: { shortName: home },
                awayTeam: { shortName: away }
            };
        });

    } catch (error) {
        console.error("Erro Lista:", error.message);
        return [];
    }
}

// --- 2. DADOS DO JOGO ---
async function fetchGameData(forceUpdate = false) {
    if (!gameState.matchId) return;

    try {
        let data = matchesCache;
        // Se o cache estiver vazio ou forçado, busca de novo (mas a lista completa)
        if (forceUpdate || data.length === 0) {
             const response = await axios.get(`${BASE_URL}/get_games`, { params: { key: API_KEY } });
             let raw = response.data;
             if (raw && typeof raw === 'object' && !Array.isArray(raw)) data = Object.values(raw);
             else data = raw || [];
        }

        const match = data.find(m => String(m.id) === String(gameState.matchId) || String(m.universal_id) === String(gameState.matchId));

        if (match) {
            if (match.orig_teams && match.orig_teams.includes(' vs ')) {
                const parts = match.orig_teams.split(' vs ');
                gameState.homeName = parts[0].trim(); gameState.awayName = parts[1].trim();
            }

            if (match.score) {
                const parts = String(match.score).split('-');
                if(parts.length >= 2) {
                    gameState.homeScore = parts[0].trim(); gameState.awayScore = parts[1].trim();
                }
            }
            // Tenta inferir status pelo horário se não tiver status explícito
            gameState.gameTime = match.status || "AO VIVO"; 
            io.emit('updateOverlay', gameState);
        }
    } catch (error) {
        console.error("Erro Jogo:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
