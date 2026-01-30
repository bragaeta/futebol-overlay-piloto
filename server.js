const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Redireciona a raiz para o admin.html
app.get('/', (req, res) => {
    res.redirect('/admin.html');
});

// A chave pode vir da variável de ambiente do Render
const API_KEY = process.env.API_KEY || "78cfaff5-5122-4990-9112-5dc1d12a6179";
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

function parseBoltDate(dateStr) {
    try {
        if (!dateStr) return new Date();
        let cleanStr = dateStr.replace(',', '').trim(); 
        const parts = cleanStr.split(/\s+/); 
        let datePart = parts[0]; 
        let timePart = parts[1]; 
        let meridian = parts.length > 2 ? parts[2] : null;

        if (!timePart) return new Date(); 

        let [hours, minutes] = timePart.split(':').map(Number);
        if (meridian === 'PM' && hours < 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;

        const isoString = `${datePart}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00.000`;
        return new Date(isoString);
    } catch (e) {
        return new Date();
    }
}

async function listMatches() {
    try {
        console.log("Buscando lista de jogos...");
        const response = await axios.get(`${BASE_URL}/get_games`, { params: { key: API_KEY } });

        let data = response.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) data = Object.values(data);
        if (!Array.isArray(data)) return [];

        const now = new Date();
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

        const forbiddenSports = ['ncaab', 'ncaa', 'basketball', 'nba', 'euroleague', 'ufc', 'boxing', 'mma', 'fighting', 'nhl', 'hockey', 'nfl', 'football', 'american football', 'volleyball', 'tennis', 'handball', 'cricket', 'rugby'];

        const validMatches = data.filter(m => {
            const sport = (m.sport || "").toLowerCase();
            return !forbiddenSports.some(bad => sport.includes(bad)) && m.when && m.when.startsWith(todayStr);
        });

        matchesCache = validMatches;

        return validMatches.map(event => {
            let home = "Casa", away = "Fora";
            if (event.orig_teams && event.orig_teams.includes(' vs ')) {
                const parts = event.orig_teams.split(' vs ');
                home = parts[0].trim(); away = parts[1].trim();
            } else if (event.game && event.game.includes(' vs ')) {
                const parts = event.game.split(' vs ');
                home = parts[0].trim(); away = parts[1].split(',')[0].trim();
            }

            const realDateObj = parseBoltDate(event.when);

            return {
                id: event.universal_id || event.id,
                utcDate: realDateObj.toString(),
                competition: { name: event.sport || "Futebol" },
                homeTeam: { shortName: home },
                awayTeam: { shortName: away }
            };
        });

    } catch (error) {
        return [];
    }
}

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
            gameState.gameTime = match.status || "AO VIVO"; 
            io.emit('updateOverlay', gameState);
        }
    } catch (error) { console.error(error); }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Rodando na porta ${PORT}`); });
