// prisma.js
import { PrismaClient } from "@prisma/client";

// O padrão global garante que o PrismaClient seja instanciado apenas uma vez,
// mesmo que o container serverless seja "reutilizado" pela Vercel.
// Isso evita erros de conexão e o erro "FUNCTION_INVOCATION_FAILED".
const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
    global.prisma = prisma;
}

export { prisma };