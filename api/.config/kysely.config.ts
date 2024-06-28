import { PostgresDialect } from "kysely";
import { defineConfig } from "kysely-ctl";
import { Pool } from "pg";

const dialect = new PostgresDialect({
    pool: new Pool({
        connectionString: process.env.DATABASE_URL
    })
});

export default defineConfig({
    dialect,
    migrations: {
        migrationFolder: "src/core/adapters/dbApi/kysely/migrations"
    }
});
