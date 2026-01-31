"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const config_1 = require("prisma/config");
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and set DATABASE_URL (e.g. postgresql://user:password@localhost:5432/insight_garden).");
}
if (!databaseUrl.includes(":5432/") && !databaseUrl.includes(":5432?")) {
    console.error("Warning: DATABASE_URL should use port 5432 for docker-compose Postgres. Current value may use a different port.");
}
exports.default = (0, config_1.defineConfig)({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: databaseUrl,
    },
});
//# sourceMappingURL=prisma.config.js.map