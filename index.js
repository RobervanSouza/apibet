// index.js
import express from "express";
import serverless from "serverless-http";
import axios from "axios";
import dotenv from "dotenv";
import { prisma } from "./prisma.js";

dotenv.config();

const app = express();

// Log inicial
console.log("🚀 Inicializando servidor Express...");
console.log(`🌍 Ambiente: ${process.env.NODE_ENV || "desenvolvimento"}`);

// Função para formatar o horário em formato legível
function formatarHorario(iso) {
    try {
        if (!iso) return "Indefinido";
        return new Date(iso).toLocaleString("pt-BR", { hour12: false });
    } catch {
        return "Indefinido";
    }
}

// 🔹 Rota para atualizar jogos da API-Football e salvar no MongoDB
app.get("/atualizar-jogos", async (req, res) => {
    console.log("📡 Requisição recebida em /atualizar-jogos");

    try {
        const { data } = await axios.get(
            "https://v3.football.api-sports.io/fixtures?live=all",
            {
                headers: {
                    "x-apisports-key": process.env.API_FOOTBALL_KEY,
                    Accept: "application/json",
                },
            }
        );

        if (!data.response || !Array.isArray(data.response)) {
            console.error("⚠️ Estrutura de dados inesperada:", data);
            return res.status(500).json({ erro: "Estrutura de dados inesperada" });
        }

        const jogosDetalhes = [];

        for (const event of data.response) {
            const nome = `${event.teams.home.name} vs ${event.teams.away.name}`;
            const status = event.fixture?.status?.short ?? "ND";
            const horario = event.fixture?.date ? formatarHorario(event.fixture.date) : "Horário indefinido";
            const placar = `${event.goals?.home ?? 0} x ${event.goals?.away ?? 0}`;

            let estatisticas = {};
            try {
                const { data: statsData } = await axios.get(
                    `https://v3.football.api-sports.io/fixtures/statistics?fixture=${event.fixture.id}`,
                    {
                        headers: {
                            "x-apisports-key": process.env.API_FOOTBALL_KEY,
                            Accept: "application/json",
                        },
                    }
                );

                if (statsData.response && Array.isArray(statsData.response)) {
                    statsData.response.forEach((teamStats) => {
                        const teamName = teamStats.team.name;
                        estatisticas[ teamName ] = {};
                        teamStats.statistics.forEach((stat) => {
                            estatisticas[ teamName ][ stat.type ] = stat.value ?? 0;
                        });
                    });
                }
            } catch (errStats) {
                console.error("Erro ao buscar estatísticas:", nome, errStats.message);
            }

            const eventos = event.events?.map((e) => ({
                minuto: e.time?.elapsed ?? 0,
                tipo: e.type ?? "Desconhecido",
                detalhe: e.detail ?? "",
                jogador: e.player?.name ?? "",
                equipe: e.team?.name ?? "",
            })) ?? [];

            const jogo = {
                bet: event.fixture.id.toString(),
                nome,
                horario,
                placar,
                status,
                estatisticas,
                eventos,
            };

            await prisma.jogos.upsert({
                where: { bet: jogo.bet },
                update: jogo,
                create: jogo,
            });

            jogosDetalhes.push(jogo);
            console.log(`✔️ ${nome} | ${placar} | ${status}`);
        }

        console.log(`✅ Atualização concluída: ${jogosDetalhes.length} jogos.`);
        res.json({ sucesso: true, total: jogosDetalhes.length, jogos: jogosDetalhes });
    } catch (error) {
        console.error("❌ Erro ao buscar dados:", error.message);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Dados:", error.response.data);
        }
        res.status(500).json({ erro: "Falha ao buscar dados da API-Football" });
    }
});

// 🔹 Rota para listar todos os jogos do banco
app.get("/", async (req, res) => {
    console.log("📡 Requisição recebida em /");
    try {
        const jogos = await prisma.jogos.findMany();
        res.json(jogos);
    } catch (error) {
        console.error("Erro ao listar jogos:", error.message);
        res.status(500).json({ erro: "Erro ao buscar jogos no banco" });
    }
});

// 🔹 Exporta o handler para Vercel
export default serverless(app);
// 🔹 Mantém funcionamento local
if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
} else {
    console.log("✅ Aplicação rodando no ambiente Vercel (sem app.listen)");
}
