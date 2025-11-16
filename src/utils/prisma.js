// prisma.js
import { PrismaClient } from "@prisma/client";

let prisma;

if (globalThis.__prisma) {
    prisma = globalThis.__prisma;
} else {
    prisma = new PrismaClient();
    globalThis.__prisma = prisma;
}

// Nota: NÃO chamamos prisma.$disconnect() automaticamente em serverless.

export { prisma };
