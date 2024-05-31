import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable("agents")
        .addColumn("id", "serial", col => col.primaryKey())
        .addColumn("email", "text", col => col.notNull())
        .addColumn("organization", "text", col => col.notNull())
        .addColumn("about", "text")
        .addColumn("isPublic", "boolean", col => col.notNull())
        .execute();

    await db.schema
        .createTable("softwares")
        .addColumn("id", "serial", col => col.primaryKey())
        .addColumn("name", "text", col => col.notNull())
        .addColumn("description", "text", col => col.notNull())
        .addColumn("referencedSinceTime", "integer", col => col.notNull())
        .addColumn("updateTime", "integer", col => col.notNull())
        .addColumn("dereferencing", "jsonb")
        .addColumn("isStillInObservation", "boolean", col => col.notNull())
        .addColumn("parentSoftwareWikidataId", "text")
        .addColumn("doRespectRgaa", "boolean")
        .addColumn("isFromFrenchPublicService", "boolean", col => col.notNull())
        .addColumn("isPresentInSupportContract", "boolean", col => col.notNull())
        .addColumn("similarSoftwareExternalDataIds", "jsonb")
        .addColumn("externalId", "text")
        .addColumn("externalDataOrigin", "text")
        .addColumn("comptoirDuLibreId", "integer")
        .addColumn("license", "text", col => col.notNull())
        .addColumn("softwareType", "jsonb", col => col.notNull())
        .addColumn("catalogNumeriqueGouvFrId", "text")
        .addColumn("versionMin", "text", col => col.notNull())
        .addColumn("workshopUrls", "jsonb", col => col.notNull())
        .addColumn("testUrls", "jsonb", col => col.notNull())
        .addColumn("categories", "jsonb", col => col.notNull())
        .addColumn("generalInfoMd", "text")
        .addColumn("addedByAgentEmail", "text", col => col.notNull())
        .addColumn("logoUrl", "text")
        .addColumn("keywords", "jsonb", col => col.notNull())
        .execute();

    await db.schema
        .createTable("software_users")
        .addColumn("softwareId", "integer", col => col.notNull())
        .addColumn("agentId", "text", col => col.notNull())
        .addColumn("useCaseDescription", "text", col => col.notNull())
        .addColumn("os", "text")
        .addColumn("version", "text", col => col.notNull())
        .addColumn("serviceUrl", "text")
        .execute();

    await db.schema
        .createTable("software_referents")
        .addColumn("softwareId", "integer", col => col.notNull())
        .addColumn("agentId", "text", col => col.notNull())
        .addColumn("useCaseDescription", "text", col => col.notNull())
        .addColumn("os", "text")
        .addColumn("version", "text", col => col.notNull())
        .addColumn("serviceUrl", "text")
        .execute();

    await db.schema
        .createTable("instances")
        .addColumn("id", "integer", col => col.notNull())
        .addColumn("mainSoftwareSillId", "integer", col => col.notNull())
        .addColumn("organization", "text", col => col.notNull())
        .addColumn("targetAudience", "text", col => col.notNull())
        .addColumn("publicUrl", "text")
        .addColumn("otherSoftwareWikidataIds", "jsonb")
        .addColumn("addedByAgentEmail", "text", col => col.notNull())
        .addColumn("referencedSinceTime", "integer", col => col.notNull())
        .addColumn("updateTime", "integer", col => col.notNull())
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable("instances").execute();
    await db.schema.dropTable("software_referents").execute();
    await db.schema.dropTable("software_users").execute();
    await db.schema.dropTable("softwares").execute();
    await db.schema.dropTable("agents").execute();
}
