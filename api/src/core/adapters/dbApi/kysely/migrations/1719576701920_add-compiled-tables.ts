import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable("compiled_softwares")
        .addColumn("softwareId", "integer", col => col.notNull().references("softwares.id").onDelete("cascade"))
        .addColumn("serviceProviders", "jsonb", col => col.notNull())
        .addColumn("softwareExternalData", "jsonb")
        .addColumn("similarExternalSoftwares", "jsonb", col => col.notNull())
        .addColumn("parentWikidataSoftware", "jsonb")
        .addColumn("comptoirDuLibreSoftware", "jsonb")
        .addColumn("annuaireCnllServiceProviders", "jsonb")
        .addColumn("latestVersion", "jsonb")
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable("compiled_softwares").execute();
}
