import { PrismaClient } from "@prisma/client";

// Next.js hot-reloads modules on every save in dev, which would otherwise
// instantiate a brand-new PrismaClient (and a new DB connection) on every
// single file change, quickly exhausting Supabase's connection limit.
// Stashing the instance on `globalThis` survives hot-reloads; in production
// each serverless invocation gets a fresh module scope anyway, so this is
// a no-op there.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}