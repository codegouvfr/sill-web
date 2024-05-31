import { PostgresDialect } from "kysely";
import { Pool } from "pg";

export const createPgDialect = (connectionString: string) =>
    new PostgresDialect({
        pool: new Pool({
            connectionString
        })
    });
