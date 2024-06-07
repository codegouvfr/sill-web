import { Kysely } from "kysely";
import type { Db, DbApi } from "../../ports/DbApi";
import { Database } from "./kysely/kysely.database";
import { createPgDialect } from "./kysely/kysely.dialect";

export type PgConfig = {
    dbUrl: string;
};

export function createPgDbApi(params: PgConfig): {
    dbApi: DbApi;
    initializeDbApiCache: () => Promise<void>;
} {
    const db = new Kysely<Database>({ dialect: createPgDialect(params.dbUrl) });

    const dbApi: DbApi = {
        "fetchCompiledData": () => {
            throw new Error("Not implemented");
        },
        "fetchDb": async () => {
            const agentRows: Db.AgentRow[] = await db
                .selectFrom("agents")
                .selectAll()
                .execute()
                .then(rows =>
                    rows.map(row => ({
                        ...row,
                        about: row.about ?? undefined
                    }))
                );

            const softwareRows: Db.SoftwareRow[] = await db
                .selectFrom("softwares")
                .selectAll()
                .execute()
                .then(rows =>
                    rows.map(row => ({
                        ...row,
                        dereferencing: row.dereferencing ?? undefined,
                        parentSoftwareWikidataId: row.parentSoftwareWikidataId ?? undefined,
                        externalId: row.externalId ?? undefined,
                        externalDataOrigin: row.externalDataOrigin ?? undefined,
                        comptoirDuLibreId: row.comptoirDuLibreId ?? undefined,
                        catalogNumeriqueGouvFrId: row.catalogNumeriqueGouvFrId ?? undefined,
                        generalInfoMd: row.generalInfoMd ?? undefined,
                        logoUrl: row.logoUrl ?? undefined
                    }))
                );

            const softwareReferentRows: Db.SoftwareReferentRow[] = await db
                .selectFrom("software_referents as r")
                .innerJoin("agents as a", "r.agentId", "a.id")
                .select(["softwareId", "isExpert", "serviceUrl", "useCaseDescription", "a.email as agentEmail"])
                .execute()
                .then(rows => rows.map(row => ({ ...row, serviceUrl: row.serviceUrl ?? undefined })));

            const softwareUserRows: Db.SoftwareUserRow[] = await db
                .selectFrom("software_users as u")
                .innerJoin("agents as a", "u.agentId", "a.id")
                .select(["softwareId", "a.email as agentEmail", "useCaseDescription", "os", "version", "serviceUrl"])
                .execute()
                .then(rows =>
                    rows.map(row => ({
                        ...row,
                        os: row.os ?? undefined,
                        serviceUrl: row.serviceUrl ?? undefined
                    }))
                );

            const instanceRows: Db.InstanceRow[] = await db
                .selectFrom("instances")
                .selectAll()
                .execute()
                .then(rows =>
                    rows.map(row => ({
                        ...row,
                        publicUrl: row.publicUrl ?? undefined
                    }))
                );

            return {
                agentRows,
                softwareRows,
                softwareReferentRows,
                softwareUserRows,
                instanceRows
            };
        },
        "updateDb": async ({ commitMessage, newDb }) => {
            throw new Error("Not implemented");
        },
        "updateCompiledData": async ({ newCompiledData, commitMessage }) => {
            throw new Error("Not implemented");
        }
    };

    const initializeDbApiCache = async () => {
        const start = Date.now();

        console.log("Starting dbApi cache initialization...");

        // TODO

        console.log(`dbApi cache initialization done in ${Date.now() - start}ms`);
    };

    return {
        dbApi,
        initializeDbApiCache
    };
}
