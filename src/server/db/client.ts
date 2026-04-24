import { PrismaClient } from "@/generated/prisma";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  g.prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export type DB = PrismaClient;
