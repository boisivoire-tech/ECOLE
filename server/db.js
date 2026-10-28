import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error(
    "[ERREUR CONFIGURATION] La variable DATABASE_URL est absente. Copiez '.env.example' vers '.env' et renseignez l'adresse PostgreSQL."
  );
  process.exit(1);
}

const poolMax = Math.max(1, Number(process.env.DB_POOL_MAX) || 10);

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis: poolMax === 1 ? 250 : 10000,
});

export const prisma = new PrismaClient({ adapter });
