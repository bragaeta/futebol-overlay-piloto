const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO BOLT ODDS ---
const API_KEY = "78cfaff5-5122-4990-9112-5dc1d12a6179";
const BASE_URL = "https://spro.agency/api";

let gameState = {
    homeName: "CASA", awayName: "FORA",
    homeScore: 0, awayScore: 0,
    homeCrest: "", awayCrest: "",
    gameTime: "00:00",
    matchId: null,
    events: []
};

// Cache simples da lista de jogos para não buscar na API toda hora
let matchesCache = [];

io.on('connection', (socket) => {
    socket.emit('updateOverlay', gameState);

    socket.on('trackMatch', (id) => {
        console.log("--> COMANDO RECEBIDO: Rastrear ID", id);
        gameState.matchId = id;
        fetchGameData(true); // Força busca imediata
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

async function listMatches() {
    try {
        console.log("Buscando lista na API...");
        const response = await axios.get(`${BASE_URL}/get_games`, {
            params: { key: API_KEY }
        });

        let data = response.data;
        // Converte objeto gigante em lista
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            data = Object.values(data);
        }

        if (!Array.isArray(data)) return [];
        
        matchesCache = data; // Salva no cache

        // Prepara os dados para o Admin
        return data.map(event => {
            let home = "Casa";
            let away = "Fora";
            
            // Lógica robusta para separar nomes (Funciona pra Futebol e NBA)
            if (event.orig_teams && event.orig_teams.includes(' vs ')) {
                const parts = event.orig_teams.split(' vs ');
                home = parts[0].trim();
                away = parts[1].trim();
            } else if (event.game && event.game.includes(' vs ')) {
                const parts = event.game.split(' vs ');
                home = parts[0].trim();
                // Limpa sujeira de data no nome do time away
                if(parts[1].includes(',')) {
                    away = parts[1].split(',')[0].trim();
                } else {
                    away = parts[1].trim();
                }
            }

            return {
                id: event.universal_id || event.id, 
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

async function fetchGameData(forceUpdate = false) {
    if (!gameState.matchId) return;

    // Se tivermos cache recente e não for update forçado, usamos o cache
    // Mas a cada 15s o setInterval roda, então idealmente buscamos fresco se for Live
    
    try {
        // Se a lista estiver vazia, busca de novo
        let data = matchesCache;
        if (forceUpdate || data.length === 0) {
             const response = await axios.get(`${BASE_URL}/get_games`, {
                params: { key: API_KEY }
            });
            let rawData = response.data;
            if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
                data = Object.values(rawData);
            }
            matchesCache = data;
        }

        // Procura o jogo na lista
        const match = data.find(m => 
            String(m.id) === String(gameState.matchId) || 
            String(m.universal_id) === String(gameState.matchId)
        );

        if (match) {
            console.log(`Jogo Encontrado: ${match.orig_teams || match.game}`);
            
            // Atualiza Nomes
            if (match.orig_teams && match.orig_teams.includes(' vs ')) {
                const parts = match.orig_teams.split(' vs ');
                gameState.homeName = parts[0].trim();
                gameState.awayName = parts[1].trim();
            }

            // Atualiza Placar (Lógica genérica para tentar achar score)
            // Nota: No plano Free Bolt, o score nem sempre vem na lista 'get_games' para jogos agendados
            if (match.score) {
                const parts = String(match.score).split('-');
                if(parts.length >= 2) {
                    gameState.homeScore = parts[0].trim();
                    gameState.awayScore = parts[1].trim();
                }
            }
            
            gameState.gameTime = match.status || "AO VIVO";

            io.emit('updateOverlay', gameState);
        } else {
            console.log("Jogo não encontrado na lista atual (pode ter acabado ou ID mudou)");
        }
    } catch (error) {
        console.error("Erro Jogo:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
