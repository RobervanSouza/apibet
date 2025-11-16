import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import { prisma } from "../prisma/client.js";

dotenv.config();

const app = express();
app.use(express.json());

// rota raiz
app.get("/", (req, res) => {
    return res.json({
        ok: true,
        message: "API rodando na Vercel",
        timestamp: new Date().toISOString()
    });
});

// ping
app.get("/ping", (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

// health
app.get("/health", async (req, res) => {
    const checks = {
        env: {
            API_FOOTBALL_KEY: !!process.env.API_FOOTBALL_KEY,
            DATABASE_URL: !!process.env.DATABASE_URL
        },
        prisma: null,
        apiFootball: null
    };

    try {
        await prisma.$queryRaw`SELECT 1 as ok`;
        checks.prisma = true;
    } catch (err) {
        checks.prisma = err.message;
    }

    try {
        await axios.head("https://v3.football.api-sports.io/status", {
            headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
            timeout: 4000
        });
        checks.apiFootball = true;
    } catch (err) {
        checks.apiFootball = err.message;
    }

    res.json(checks);
});

// jogos
app.get("/jogos", async (req, res) => {
    try {
        const jogos = await prisma.jogos.findMany();
        res.json({ ok: true, total: jogos.length, jogos });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

export default app;
