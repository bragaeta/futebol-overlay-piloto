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
    homeCrest: "", awayCrest: "", // Bolt Free não manda crest
    gameTime: "00:00",
    matchId: null
};

let matchesCache = [];

io.on('connection', (socket) => {
    socket.emit('updateOverlay', gameState);

    socket.on('trackMatch', (id) => {
        console.log("Rastreando ID:", id);
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

// --- FUNÇÃO AUXILIAR: CONVERTER DATA DA BOLT PARA ISO ---
function parseBoltDate(dateStr) {
    // Formato esperado: "2026-01-30, 07:00 PM" ou "2026-01-30, 11:30"
    try {
        if (!dateStr) return new Date();
        
        // Remove a vírgula
        let cleanStr = dateStr.replace(',', ''); 
        const parts = cleanStr.split(' '); // [Data, Hora, (AM/PM)]
        
        let datePart = parts[0]; // YYYY-MM-DD
        let timePart = parts[1]; // HH:MM
        let meridian = parts.length > 2 ? parts[2] : null;

        let [hours, minutes] = timePart.split(':').map(Number);

        // Ajuste 12h -> 24h
        if (meridian === 'PM' && hours < 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;

        // Cria a data em UTC (Zulu Time)
        // String ISO: "2026-01-30T19:00:00.000Z"
        const isoString = `${datePart}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00.000Z`;
        
        return new Date(isoString);
    } catch (e) {
        console.error("Erro ao converter data:", dateStr, e.message);
        return new Date(); // Fallback para agora
    }
}

// --- 1. BUSCAR LISTA FILTRADA ---
async function listMatches() {
    try {
        console.log("Buscando lista...");
        const response = await axios.get(`${BASE_URL}/get_games`, { params: { key: API_KEY } });

        let data = response.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            data = Object.values(data);
        }
        if (!Array.isArray(data)) return [];

        // Filtra DATA DE HOJE (Fuso Brasil -3)
        const now = new Date();
        // Ajustamos "agora" para data string local simples para comparar
        const todayStr = now.toISOString().split('T')[0]; 

        // --- FILTRO DE ESPORTES (LISTA NEGRA) ---
        const forbiddenSports = [
            'ncaab', 'ncaa', 'basketball', 'nba', 'euroleague', 
            'call of duty', 'league of legends', 'valorant', 'esports',
            'ufc', 'boxing', 'mma', 'fighting',
            'nhl', 'hockey', 'nfl', 'football', 'american football',
            'volleyball', 'tennis', 'handball'
        ];

        const validMatches = data.filter(m => {
            const sport = (m.sport || "").toLowerCase();
            const isForbidden = forbiddenSports.some(bad => sport.includes(bad));
            if (isForbidden) return false;

            // Verifica se a data da API bate com hoje (Comparação de String simples para garantir)
            return m.when && m.when.startsWith(todayStr);
        });

        console.log(`Jogos de Futebol hoje: ${validMatches.length}`);
        matchesCache = validMatches;

        return validMatches.map(event => {
            let home = "Casa", away = "Fora";
            
            // Lógica de nomes
            if (event.orig_teams && event.orig_teams.includes(' vs ')) {
                const parts = event.orig_teams.split(' vs ');
                home = parts[0].trim(); away = parts[1].trim();
            } else if (event.game && event.game.includes(' vs ')) {
                const parts = event.game.split(' vs ');
                home = parts[0].trim(); away = parts[1].split(',')[0].trim();
            }

            // AQUI O SEGREDO: Convertemos a data estranha da Bolt para um Objeto Date real
            const realDateObj = parseBoltDate(event.when);

            return {
                id: event.universal_id || event.id,
                // Enviamos o objeto ISO string correto para o front
                utcDate: realDateObj.toISOString(),
                competition: { name: event.sport || "Futebol" },
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
            
            // A API Free não manda escudos (crest). 
            // Resetamos para vazio para não mostrar escudo errado do jogo anterior.
            gameState.homeCrest = "";
            gameState.awayCrest = "";

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
