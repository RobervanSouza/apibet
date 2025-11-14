// prisma.js
import { PrismaClient } from "@prisma/client";

// Padrão de instância única para evitar erros em ambientes serverless
const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
    global.prisma = prisma;
}

export { prisma };