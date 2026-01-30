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

// Estado do Jogo
let gameState = {
    homeName: "CASA", awayName: "FORA",
    homeScore: 0, awayScore: 0,
    homeCrest: "", awayCrest: "",
    gameTime: "00:00",
    matchId: null,
    events: [] 
};

io.on('connection', (socket) => {
    socket.emit('updateOverlay', gameState);

    socket.on('trackMatch', (id) => {
        console.log("Rastreando ID:", id);
        gameState.matchId = id;
        fetchGameData();
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

// --- 1. BUSCAR LISTA DE JOGOS (CORRIGIDO) ---
async function listMatches() {
    try {
        console.log("Buscando lista na Bolt Odds...");
        const response = await axios.get(`${BASE_URL}/get_games`, {
            params: { key: API_KEY }
        });

        let data = response.data;

        // --- CORREÇÃO PRINCIPAL: Converter Objeto em Array ---
        // A API retorna um objeto onde as chaves são nomes de jogos. 
        // Precisamos extrair apenas os valores para virar uma lista.
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            data = Object.values(data);
        }

        if (!Array.isArray(data)) {
            console.log("Formato inesperado:", typeof data);
            return [];
        }
        
        // Filtra para pegar apenas Futebol
        // Remove UFC, Boxing, Basquete (NCAAB), etc.
        const soccerMatches = data.filter(m => {
            const sport = (m.sport || "").toLowerCase();
            return !sport.includes('ufc') && 
                   !sport.includes('boxing') && 
                   !sport.includes('ncaab') &&
                   !sport.includes('nfl');
        });

        console.log(`Jogos de futebol encontrados: ${soccerMatches.length}`);

        return soccerMatches.map(event => {
            // "Hamburg vs Bayern Munchen" -> separa os nomes
            let home = "Casa";
            let away = "Fora";
            
            // Tenta pegar os nomes do campo orig_teams que é mais limpo
            if (event.orig_teams && event.orig_teams.includes(' vs ')) {
                const parts = event.orig_teams.split(' vs ');
                home = parts[0].trim();
                away = parts[1].trim();
            } else if (event.game && event.game.includes(' vs ')) {
                // Fallback para o nome do jogo
                const parts = event.game.split(' vs ');
                home = parts[0].trim();
                // O nome do away as vezes vem sujo com a data, mas no overlay corrigimos
                away = parts[1].split(',')[0].trim(); 
            }

            // Tratamento da data para não quebrar o frontend
            // A API manda "2026-01-31, 12:30 PM". Vamos tentar converter pra formato padrão.
            let cleanDate = event.when;
            try {
                // Substitui a vírgula para facilitar pro Date()
                cleanDate = event.when.replace(',', ''); 
            } catch(e) {}

            return {
                id: event.universal_id || event.id, 
                utcDate: cleanDate, // Envia a string original ou limpa
                competition: { name: event.sport || "Futebol" },
                homeTeam: { shortName: home, crest: "" },
                awayTeam: { shortName: away, crest: "" }
            };
        });

    } catch (error) {
        console.error("Erro Lista:", error.message);
        return [];
    }
}

// --- 2. BUSCAR DADOS DO JOGO ---
async function fetchGameData() {
    if (!gameState.matchId) return;

    try {
        const response = await axios.get(`${BASE_URL}/get_games`, {
            params: { key: API_KEY }
        });

        let data = response.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            data = Object.values(data);
        }

        const match = data.find(m => 
            String(m.id) === String(gameState.matchId) || 
            String(m.universal_id) === String(gameState.matchId)
        );

        if (match) {
            if (match.orig_teams && match.orig_teams.includes(' vs ')) {
                const parts = match.orig_teams.split(' vs ');
                gameState.homeName = parts[0].trim();
                gameState.awayName = parts[1].trim();
            }

            // Jogos futuros não tem placar na lista 'get_games'
            // Mas se tiver, tentamos ler
            if (match.score) {
                const parts = match.score.split('-');
                if(parts.length >= 2) {
                    gameState.homeScore = parts[0].trim();
                    gameState.awayScore = parts[1].trim();
                }
            }
            
            gameState.gameTime = "AGENDADO"; // Bolt Free não manda tempo real preciso aqui

            io.emit('updateOverlay', gameState);
            console.log(`Jogo Atualizado: ${gameState.homeName} x ${gameState.awayName}`);
        }
    } catch (error) {
        console.error("Erro Jogo:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
