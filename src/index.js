import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { prisma } from "./utils/prisma.js";

dotenv.config();

const app = express();
const PORT = 3000;

// Função para formatar horário em formato legível local
function formatarHorario(iso) {
    const date = new Date(iso);
    return date.toLocaleString("pt-BR", { hour12: false });
}

// 🔹 Rota para atualizar jogos da API-Football e salvar no MongoDB
app.get("/atualizar-jogos", async (req, res) => {
    try {
        // 1️⃣ Pega todos os jogos ao vivo
        const { data } = await axios.get(
            "https://v3.football.api-sports.io/fixtures?live=all",
            {
                headers: {
                    "x-apisports-key": "18559b19e7aea4c4e8264dd385afd3b3",
                    "Accept": "application/json"
                }
            }
        );

        if (!data.response || !Array.isArray(data.response)) {
            console.error("Estrutura de dados inesperada:", data);
            return res.status(500).json({ erro: "Estrutura de dados inesperada" });
        }

        const jogosDetalhes = [];

        for (const event of data.response) {
            const nome = `${event.teams.home.name} vs ${event.teams.away.name}`;
            const status = event.fixture.status.short;
            const horario = formatarHorario(event.fixture.date);
            const placarHome = event.goals.home ?? 0;
            const placarAway = event.goals.away ?? 0;
            const placar = `${placarHome} x ${placarAway}`;

            // 2️⃣ Busca estatísticas detalhadas do jogo
            let estatisticas = {};
            try {
                const { data: statsData } = await axios.get(
                    `https://v3.football.api-sports.io/fixtures/statistics?fixture=${event.fixture.id}`,
                    {
                        headers: {
                            "x-apisports-key": "18559b19e7aea4c4e8264dd385afd3b3",
                            "Accept": "application/json"
                        }
                    }
                );

                if (statsData.response && Array.isArray(statsData.response)) {
                    statsData.response.forEach(teamStats => {
                        const teamName = teamStats.team.name;
                        estatisticas[ teamName ] = {};
                        teamStats.statistics.forEach(stat => {
                            // Exemplo: Shots, Possession, Corners, Fouls, Yellow Cards, Red Cards
                            estatisticas[ teamName ][ stat.type ] = stat.value;
                        });
                    });
                }
            } catch (errStats) {
                console.error("Erro ao buscar estatísticas do jogo:", nome, errStats.message);
            }

            // Eventos detalhados do jogo
            const eventos = event.events?.map(e => ({
                minuto: e.time.elapsed,
                tipo: e.type,
                detalhe: e.detail,
                jogador: e.player?.name ?? null,
                equipe: e.team?.name ?? null
            })) ?? [];

            const jogo = {
                bet: event.fixture.id.toString(),
                nome,
                horario,
                placar,
                status,
                estatisticas,
                eventos
            };

            // Salva/atualiza no MongoDB (upsert)
            await prisma.jogos.upsert({
                where: { bet: jogo.bet },
                update: jogo,
                create: jogo
            });

            jogosDetalhes.push(jogo);

            // Mostra no console
            console.log(`- ${nome}`);
            console.log(`   Horário: ${horario}`);
            console.log(`   Placar:  ${placar}`);
            console.log(`   Status:  ${status}`);
            console.log(`   Estatísticas:`, estatisticas);
            console.log(`   Eventos:`, eventos);
            console.log("----------------------------------------------------");
        }

        // Retorna JSON organizado no navegador
        res.json({ sucesso: true, total: jogosDetalhes.length, jogos: jogosDetalhes });

    } catch (error) {
        console.error("Erro ao buscar dados da API-Football:", error.message);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Dados:", error.response.data);
        }
        res.status(500).json({ erro: "Falha ao buscar dados da API-Football" });
    }
});

// 🔹 Rota para listar todos os jogos do banco
app.get("/", async (req, res) => {
    try {
        const jogos = await prisma.jogos.findMany();
        res.json(jogos);
    } catch (error) {
        console.error("Erro ao listar jogos:", error.message);
        res.status(500).json({ erro: "Erro ao buscar jogos no banco" });
    }
});

app.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));
