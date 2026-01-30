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
// Mantenha esta chave segura e não compartilhe publicamente em repositórios abertos
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

// Loop para atualizar os dados do jogo automaticamente a cada 15s
setInterval(() => {
    if (gameState.matchId) fetchGameData();
}, 15000); 

// --- FUNÇÃO DE DATA (CORRIGIDA) ---
function parseBoltDate(dateStr) {
    try {
        if (!dateStr) return new Date();
        
        // Remove a vírgula: "2026-01-30, 07:00 PM" -> "2026-01-30 07:00 PM"
        let cleanStr = dateStr.replace(',', '').trim(); 
        const parts = cleanStr.split(/\s+/); 
        
        let datePart = parts[0]; // YYYY-MM-DD
        let timePart = parts[1]; // HH:MM
        let meridian = parts.length > 2 ? parts[2] : null;

        if (!timePart) return new Date(); 

        let [hours, minutes] = timePart.split(':').map(Number);

        // Conversão 12h para 24h
        if (meridian === 'PM' && hours < 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;

        // IMPORTANTE: Criamos a data sem o 'Z' no final.
        // Isso faz o JS interpretar como "Horário Local" (o mesmo do seu PC/Servidor),
        // corrigindo o erro de o jogo aparecer 3 horas antes.
        const isoString = `${datePart}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00.000`;
        
        return new Date(isoString);
    } catch (e) {
        console.error("Erro ao processar data:", e);
        return new Date();
    }
}

// --- BUSCAR LISTA DE JOGOS ---
async function listMatches() {
    try {
        console.log("Buscando lista de jogos...");
        const response = await axios.get(`${BASE_URL}/get_games`, { params: { key: API_KEY } });

        let data = response.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) data = Object.values(data);
        if (!Array.isArray(data)) return [];

        const now = new Date();
        // Gera string YYYY-MM-DD local para garantir que pegamos jogos de "hoje" no seu fuso
        const todayStr = now.getFullYear() + '-' + 
                        String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(now.getDate()).padStart(2, '0');

        // --- FILTRO DE ESPORTES ---
        const forbiddenSports = [
            'ncaab', 'ncaa', 'basketball', 'nba', 'euroleague', 
            'call of duty', 'league of legends', 'valorant', 'esports',
            'ufc', 'boxing', 'mma', 'fighting',
            'nhl', 'hockey', 'nfl', 'football', 'american football',
            'volleyball', 'tennis', 'handball', 'cricket', 'rugby'
        ];

        const validMatches = data.filter(m => {
            const sport = (m.sport || "").toLowerCase();
            const isForbidden = forbiddenSports.some(bad => sport.includes(bad));
            if (isForbidden) return false;
            
            // Filtro de Data
            return m.when && m.when.startsWith(todayStr);
        });

        matchesCache = validMatches;

        return validMatches.map(event => {
            let home = "Casa", away = "Fora";
            // Tenta limpar nomes do tipo "Time A vs Time B"
            if (event.orig_teams && event.orig_teams.includes(' vs ')) {
                const parts = event.orig_teams.split(' vs ');
                home = parts[0].trim(); away = parts[1].trim();
            } else if (event.game && event.game.includes(' vs ')) {
                const parts = event.game.split(' vs ');
                home = parts[0].trim(); away = parts[1].split(',')[0].trim();
            }

            // Processa a data corrigida
            const realDateObj = parseBoltDate(event.when);

            return {
                id: event.universal_id || event.id,
                utcDate: realDateObj.toString(), // Envia como string pronta para o front
                competition: { name: event.sport || "Futebol" },
                homeTeam: { shortName: home },
                awayTeam: { shortName: away }
            };
        });

    } catch (error) {
        console.error("Erro ao listar jogos:", error.message);
        return [];
    }
}

// --- DADOS DETALHADOS DO JOGO ---
async function fetchGameData(forceUpdate = false) {
    if (!gameState.matchId) return;

    try {
        let data = matchesCache;
        // Se for update forçado ou cache vazio, busca na API de novo
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
            
            // API Free não retorna escudos, deixamos vazio por enquanto
            gameState.homeCrest = ""; 
            gameState.awayCrest = "";
            gameState.gameTime = match.status || "AO VIVO"; 
            
            io.emit('updateOverlay', gameState);
        }
    } catch (error) {
        console.error("Erro ao buscar detalhes do jogo:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
