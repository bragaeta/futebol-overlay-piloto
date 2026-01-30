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
    events: [] // Bolt Odds Free dificilmente manda eventos, mas deixamos aqui
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

// --- 1. BUSCAR LISTA DE JOGOS (Formatada) ---
async function listMatches() {
    try {
        console.log("Buscando lista na Bolt Odds...");
        const response = await axios.get(`${BASE_URL}/get_games`, {
            params: { key: API_KEY }
        });

        // A Bolt retorna uma lista direta. Vamos filtrar e formatar.
        let data = response.data || [];
        
        // Filtra para pegar apenas Futebol (Soccer, Bundesliga, etc)
        // O log mostrou "sport=Bundesliga", "sport=Ligue 1", etc.
        // Vamos pegar tudo que não for UFC/Boxing por enquanto
        data = data.filter(m => 
            !m.sport.includes('UFC') && 
            !m.sport.includes('Boxing') &&
            !m.sport.includes('NCAAB')
        );

        return data.map(event => {
            // "Hamburg vs Bayern Munchen" -> separa os nomes
            let home = "Casa";
            let away = "Fora";
            
            if (event.orig_teams && event.orig_teams.includes(' vs ')) {
                const parts = event.orig_teams.split(' vs ');
                home = parts[0].trim();
                away = parts[1].trim();
            }

            return {
                id: event.id || event.universal_id, // Usa o universal_id se não tiver ID numérico
                utcDate: event.when, // Ex: "2026-01-31, 12:30 PM"
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

// --- 2. BUSCAR DADOS DO JOGO (Placar) ---
async function fetchGameData() {
    if (!gameState.matchId) return;

    try {
        // A Bolt não tem endpoint detalhado "por ID" no plano free documentado fácil.
        // Vamos buscar a lista geral e encontrar nosso jogo nela para ver se o placar atualizou.
        // (Estratégia: Cachear a lista)
        const response = await axios.get(`${BASE_URL}/get_games`, {
            params: { key: API_KEY }
        });

        const allGames = response.data || [];
        
        // Procura o jogo pelo ID que estamos rastreando
        // Convertemos para string para garantir (universal_id mistura letras e numeros)
        const match = allGames.find(m => 
            String(m.id) === String(gameState.matchId) || 
            String(m.universal_id) === String(gameState.matchId)
        );

        if (match) {
            // Separa os nomes de novo para garantir
            if (match.orig_teams && match.orig_teams.includes(' vs ')) {
                const parts = match.orig_teams.split(' vs ');
                gameState.homeName = parts[0].trim();
                gameState.awayName = parts[1].trim();
            }

            // Lógica de Placar da Bolt (Isso varia, vamos tentar achar campos de score)
            // No log que você mandou, não tinha campo "score" explícito nos jogos agendados.
            // Mas em jogos AO VIVO, costuma aparecer algo como 'score': '1-0' ou 'home_score': 1
            
            if (match.score) {
                // Se vier "2-1" ou "2 - 1"
                const parts = match.score.split('-');
                if(parts.length >= 2) {
                    gameState.homeScore = parts[0].trim();
                    gameState.awayScore = parts[1].trim();
                }
            }
            
            // Se o jogo tiver data futura, colocamos 0x0
            gameState.gameTime = match.status || "JOGO"; // Status pode vir vazio no free

            io.emit('updateOverlay', gameState);
            console.log(`Jogo atualizado: ${gameState.homeName} x ${gameState.awayName}`);
        }
    } catch (error) {
        console.error("Erro Jogo:", error.message);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
