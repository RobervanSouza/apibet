import express from "express";
import serverless from "serverless-http";
import axios from "axios";
import dotenv from "dotenv";
import { prisma } from "./prisma.js"; // Importa a instância do PrismaClient

// Carrega variáveis de ambiente
dotenv.config();

const app = express();

console.log("🚀 Inicializando servidor Express...");
console.log(`🌍 Ambiente: ${process.env.NODE_ENV || "desenvolvimento"}`);

// Função para formatar o horário em formato legível
function formatarHorario(iso) {
    try {
        if (!iso) return "Indefinido";
        return new Date(iso).toLocaleString("pt-BR", {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour12: false
        });
    } catch {
        return "Indefinido";
    }
}

// 🛠️ Função utilitária para processar promessas em lotes (batching)
async function batchProcess(items, batchSize, asyncTask) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchPromises = batch.map(asyncTask);
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }
    return results;
}

// 🔹 Rota para atualizar jogos da API-Football e salvar no MongoDB
app.get("/atualizar-jogos", async (req, res) => {
    console.log("📡 Requisição recebida em /atualizar-jogos");

    try {
        // 1. Busca dados dos jogos ao vivo (Primeira chamada única)
        const { data } = await axios.get(
            "https://v3.football.api-sports.io/fixtures?live=all",
            {
                headers: {
                    "x-apisports-key": process.env.API_FOOTBALL_KEY,
                    Accept: "application/json",
                },
                // Timeout de 10 segundos para a requisição inicial
                timeout: 10000,
            }
        );

        const jogosParaProcessar = data.response;

        if (!jogosParaProcessar || !Array.isArray(jogosParaProcessar) || jogosParaProcessar.length === 0) {
            console.log("⚠️ Sem jogos ao vivo para processar.");
            return res.status(200).json({ sucesso: true, total: 0, jogos: [] });
        }

        // 2. Define a tarefa assíncrona para cada jogo
        const processGame = async (event) => {
            const nome = `${event.teams.home.name} vs ${event.teams.away.name}`;
            const fixtureId = event.fixture.id.toString();

            let estatisticas = {};
            let eventos = [];

            // BUSCA DE DETALHES (Stats e Events) EM PARALELO
            try {
                const [ statsResponse, eventsResponse ] = await Promise.all([
                    axios.get(
                        `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`,
                        { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY, Accept: "application/json" } }
                    ),
                    axios.get(
                        `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`,
                        { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY, Accept: "application/json" } }
                    ),
                ]);

                // Mapeamento de Estatísticas
                if (statsResponse.data.response && Array.isArray(statsResponse.data.response)) {
                    statsResponse.data.response.forEach((teamStats) => {
                        const teamName = teamStats.team.name;
                        estatisticas[ teamName ] = {};
                        teamStats.statistics.forEach((stat) => {
                            estatisticas[ teamName ][ stat.type ] = stat.value ?? 0;
                        });
                    });
                }

                // Mapeamento de Eventos
                if (eventsResponse.data.response && Array.isArray(eventsResponse.data.response)) {
                    eventos = eventsResponse.data.response.map((e) => ({
                        minuto: e.time?.elapsed ?? 0,
                        tipo: e.type ?? "Desconhecido",
                        detalhe: e.detail ?? "",
                        jogador: e.player?.name ?? "",
                        equipe: e.team?.name ?? "",
                    }));
                }
            } catch (errDetail) {
                console.warn(`⚠️ Aviso: Falha ao buscar detalhes para ${nome}: ${errDetail.message}`);
            }

            // Objeto Jogo
            const jogo = {
                bet: fixtureId,
                nome,
                horario: event.fixture.date ? formatarHorario(event.fixture.date) : "Horário indefinido",
                placar: `${event.goals?.home ?? 0} x ${event.goals?.away ?? 0}`,
                status: event.fixture?.status?.short ?? "ND",
                estatisticas,
                eventos,
            };

            // Salva/Atualiza no MongoDB (upsert)
            await prisma.jogos.upsert({
                where: { bet: jogo.bet },
                update: jogo,
                create: jogo,
            });

            console.log(`✔️ UPSERT: ${nome} | ${jogo.placar} | ${jogo.status}`);
            return jogo; // Retorna o jogo processado
        };

        // 3. Executa o processamento em lotes de 5 jogos 
        const BATCH_SIZE = 5;
        console.log(`⏳ Processando ${jogosParaProcessar.length} jogos em lotes de ${BATCH_SIZE}...`);
        const jogosProcessados = await batchProcess(jogosParaProcessar, BATCH_SIZE, processGame);

        // 4. Finaliza a rota (Seção de sucesso)
        console.log(`✅ Atualização concluída: ${jogosProcessados.length} jogos processados.`);
        res.json({ sucesso: true, total: jogosProcessados.length, jogos: jogosProcessados });

    } catch (error) {
        console.error("❌ ERRO CRÍTICO NA ATUALIZAÇÃO:", error.message);
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Dados:", error.response.data);
        }
        res.status(500).json({ erro: "Falha ao processar ou buscar dados da API-Football" });
    } finally {
        // 🚨 CRÍTICO PARA VERCEL: Fecha a conexão do Prisma para evitar o timeout de 300s.
        await prisma.$disconnect();
    }
});


// 🔹 Rota para listar todos os jogos do banco
app.get("/", async (req, res) => {
    console.log("📡 Requisição recebida em /");
    try {
        const jogos = await prisma.jogos.findMany();
        res.json(jogos);
    } catch (error) {
        console.error("❌ Erro ao listar jogos:", error.message);
        res.status(500).json({ erro: "Erro ao buscar jogos no banco" });
    } finally {
        // 🚨 CRÍTICO PARA VERCEL: Fecha a conexão do Prisma
        await prisma.$disconnect();
    }
});

// 🔹 Exporta o handler para Vercel (Exportação Padrão para Módulos ES)
export default serverless(app);

// 🔹 Mantém funcionamento local (para nodemon/npm start)
if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
} else {
    console.log("✅ Aplicação pronta para execução serverless (Vercel)");
}