import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/insight_garden";
if (!process.env.DATABASE_URL) {
  console.warn(
    "[prisma] DATABASE_URL not set; using placeholder for generate/migrate. Set DATABASE_URL for real DB connections.",
  );
}
if (
  databaseUrl &&
  !databaseUrl.includes(":5432/") &&
  !databaseUrl.includes(":5432?")
) {
  console.warn(
    "[prisma] DATABASE_URL may not use port 5432. For docker-compose use postgresql://...@localhost:5432/...",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
