import { PrismaClient } from "@prisma/client";

// Cria a instância do PrismaClient.
// Em ambientes serverless, o provedor se conecta sob demanda.
const prisma = new PrismaClient();

export { prisma };