const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO DA BOLT ODDS ---
const API_KEY = "78cfaff5-5122-4990-9112-5dc1d12a6179";
const BASE_URL = "https://spro.agency/api";
const ENDPOINT_MATCHES = "get_games"; // <--- CORRIGIDO COM SUA DESCOBERTA

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
        console.log("Rastreando ID Bolt:", id);
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
}, 10000); 

// --- BUSCAR LISTA DE JOGOS ---
async function listMatches() {
    try {
        console.log(`Buscando jogos em: ${BASE_URL}/${ENDPOINT_MATCHES}...`);
        
        const response = await axios.get(`${BASE_URL}/${ENDPOINT_MATCHES}`, {
            params: { 
                key: API_KEY,
                // Algumas APIs pedem filtros extras, se der erro tentamos tirar esses params
                // sport: 'soccer' 
            }
        });

        // Tenta achar a lista dentro da resposta (pode vir como data, games, ou direto)
        const data = response.data.data || response.data.games || response.data; 
        
        if (!Array.isArray(data)) {
            console.log("Formato de resposta Bolt diferente do esperado:", typeof data);
            // Se for um objeto com chaves numéricas, tentamos converter
            if (typeof data === 'object') return Object.values(data);
            return [];
        }

        return data.map(event => ({
            id: event.game_id || event.id, // Bolt costuma usar game_id
            utcDate: event.start_time || new Date(),
            competition: { name: event.league || "Liga Bolt" },
            homeTeam: { 
                shortName: event.home_team || event.participants?.[0]?.name || "Casa", 
                crest: "" 
            },
            awayTeam: { 
                shortName: event.away_team || event.participants?.[1]?.name || "Fora", 
                crest: "" 
            }
        }));

    } catch (error) {
        console.error("Erro Bolt (Lista):", error.message);
        return [];
    }
}

// --- BUSCAR DETALHES DO JOGO ---
async function fetchGameData() {
    if (!gameState.matchId) return;

    try {
        // Geralmente usa o mesmo endpoint, mas vamos filtrar na mão se a API não tiver busca por ID
        // (Solução temporária segura)
        const response = await axios.get(`${BASE_URL}/${ENDPOINT_MATCHES}`, {
            params: { key: API_KEY }
        });

        const data = response.data.data || response.data.games || response.data;
        const matches = Array.isArray(data) ? data : Object.values(data);
        
        // Encontra o jogo certo na lista
        // Nota: convertemos para String para garantir que compare texto com texto
        const match = matches.find(m => String(m.game_id || m.id) === String(gameState.matchId));

        if (match) {
            gameState.homeName = match.home_team || match.participants?.[0]?.name || "Casa";
            gameState.awayName = match.away_team || match.participants?.[1]?.name || "Fora";
            
            // Lógica de Placar da Bolt (Varia, mas vamos tentar o padrão)
            if (match.score) { 
                // Ex: "2 - 1"
                const parts = match.score.split('-'); 
                if(parts.length >= 2) {
                    gameState.homeScore = parts[0].trim();
                    gameState.awayScore = parts[1].trim();
                }
            }
            
            gameState.gameTime = match.status || "AO VIVO";
            io.emit('updateOverlay', gameState);
            console.log(`Bolt Atualizado: ${gameState.homeScore} - ${gameState.awayScore}`);
        }
    } catch (error) {
        console.error("Erro Bolt (Jogo):", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
