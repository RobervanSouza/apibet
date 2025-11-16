import express from "express";
import serverless from "serverless-http";
import axios from "axios";
import dotenv from "dotenv";
import { prisma } from "../src/utils/prisma.js";

dotenv.config();

const app = express();

// Middleware de logs simples
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] -> INICIO ${req.method} ${req.url}`);
    const start = Date.now();
    res.on("finish", () => {
        console.log(`[${new Date().toISOString()}] <- FIM ${req.method} ${req.url} status=${res.statusCode} time=${Date.now() - start}ms`);
    });
    next();
});

// Rota mínima para checar se a app responde (SEM DB)
app.get("/ping", (req, res) => {
    return res.json({ ok: true, env: process.env.NODE_ENV || "desenvolvimento", time: new Date().toISOString() });
});

// Health check detalhado (não bloqueante): verifica vars, DB (não await pesado) e API-FOOTBALL HEAD
app.get("/health", async (req, res) => {
    const checks = {
        envVars: {
            API_FOOTBALL_KEY: !!process.env.API_FOOTBALL_KEY,
            DATABASE_URL: !!process.env.DATABASE_URL,
        },
        prisma: { reachable: null, error: null },
        apiFootball: { reachable: null, error: null }
    };

    // Teste rápido do Prisma: execução leve e com timeout manual
    try {
        // comando leve: count limitado (não puxar muitos dados)
        const p = prisma.$queryRaw`SELECT 1 as ok`;
        const pr = await Promise.race([
            p,
            new Promise((_, reject) => setTimeout(() => reject(new Error("prisma timeout 5s")), 5000))
        ]);
        checks.prisma.reachable = true;
    } catch (err) {
        checks.prisma.reachable = false;
        checks.prisma.error = (err && err.message) ? err.message : String(err);
    }

    // Teste rápido à API-Football usando HEAD com timeout curto
    if (process.env.API_FOOTBALL_KEY) {
        try {
            const reqApi = axios.head("https://v3.football.api-sports.io/status", {
                headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
                timeout: 4000
            });
            await reqApi;
            checks.apiFootball.reachable = true;
        } catch (err) {
            checks.apiFootball.reachable = false;
            checks.apiFootball.error = (err && err.message) ? err.message : String(err);
        }
    } else {
        checks.apiFootball.reachable = false;
        checks.apiFootball.error = "API_FOOTBALL_KEY not set";
    }

    const healthy = checks.envVars.API_FOOTBALL_KEY && checks.envVars.DATABASE_URL && checks.prisma.reachable && checks.apiFootball.reachable;
    res.status(healthy ? 200 : 500).json({ healthy, checks });
});

// ROOT - rota segura e mínima: NÃO usa banco. Use isso para verificar deploy.
app.get("/", (req, res) => {
    console.log("Rota / respondendo com payload mínimo (SEM DB).");
    return res.json({ message: "OK - root minimal response", timestamp: new Date().toISOString() });
});

// Rota para listar jogos — isolada com timeout e try/catch.
// IMPORTANTE: esta rota pode ficar lenta se o Prisma travar — use /ping e /health primeiro.
app.get("/jogos", async (req, res) => {
    console.log("Entrou em /jogos — iniciando findMany");
    try {
        // Timeout manual: Promise.race entre findMany e timeout de 8s
        const jogos = await Promise.race([
            prisma.jogos.findMany(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("prisma findMany timeout 8s")), 8000))
        ]);
        console.log("Jogos retornados:", Array.isArray(jogos) ? jogos.length : typeof jogos);
        return res.json({ ok: true, total: Array.isArray(jogos) ? jogos.length : 0, jogos: jogos });
    } catch (err) {
        console.error("Erro em /jogos:", err && err.message ? err.message : err);
        return res.status(500).json({ ok: false, erro: err && err.message ? err.message : String(err) });
    }
});

// Error handler para capturar exceções não previstas
app.use((err, req, res, next) => {
    console.error("Unhandled error (middleware):", err && err.stack ? err.stack : err);
    if (!res.headersSent) {
        res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
});


if (process.env.NODE_ENV !== "production") {
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando localmente na porta ${PORT}`);
    });
}
export const handler = serverless(app);
export default handler;