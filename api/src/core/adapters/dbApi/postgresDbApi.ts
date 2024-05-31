import { Deferred } from "evt/tools/Deferred";
import * as fs from "fs";
import { Kysely } from "kysely";
import { join as pathJoin } from "path";
import type { ReturnType } from "tsafe";
import type { DbApi, Db } from "../../ports/DbApi";
import { gitSsh } from "../../../tools/gitSsh";
import { type CompiledData, compiledDataPrivateToPublic } from "../../ports/CompileData";
import { Database } from "./kysely/kysely.database";
import { createPgDialect } from "./kysely/kysely.dialect";

export const compiledDataBranch = "compiled-data";
const compiledDataPrivateJsonRelativeFilePath = "compiledData_private.json";
const compiledDataPublicJsonRelativeFilePath = compiledDataPrivateJsonRelativeFilePath.replace(
    /_private.json$/,
    "_public.json"
);
const softwareJsonRelativeFilePath = "software.json";
const agentJsonRelativeFilePath = "agent.json";
const softwareReferentJsonRelativeFilePath = "softwareReferent.json";
const softwareUserJsonRelativeFilePath = "softwareUser.json";
const instanceJsonRelativeFilePath = "instance.json";

export type PgConfig = {
    dbUrl: string;
};

export function createPostgresDbApi(params: PgConfig): {
    dbApi: DbApi;
    initializeDbApiCache: () => Promise<void>;
} {
    const db = new Kysely<Database>({ dialect: createPgDialect(params.dbUrl) });

    const dbApi: DbApi = {
        "fetchCompiledData": () => {
            const dOut = new Deferred<ReturnType<DbApi["fetchCompiledData"]>>();

            gitSsh({
                "sshUrl": dataRepoSshUrl,
                "shaish": compiledDataBranch,
                sshPrivateKeyName,
                sshPrivateKey,
                "action": async ({ repoPath }) => {
                    const compiledData: CompiledData<"private"> = JSON.parse(
                        (
                            await fs.promises.readFile(pathJoin(repoPath, compiledDataPrivateJsonRelativeFilePath))
                        ).toString("utf8")
                    );

                    dOut.resolve(compiledData);

                    return { "doCommit": false };
                }
            }).catch(error => dOut.reject(error));

            return dOut.pr;
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
            await gitSsh({
                "sshUrl": dataRepoSshUrl,
                sshPrivateKeyName,
                sshPrivateKey,
                "action": async ({ repoPath }) => {
                    await Promise.all(
                        (
                            [
                                [softwareJsonRelativeFilePath, newDb.softwareRows],
                                [agentJsonRelativeFilePath, newDb.agentRows],
                                [softwareReferentJsonRelativeFilePath, newDb.softwareReferentRows],
                                [softwareUserJsonRelativeFilePath, newDb.softwareUserRows],
                                [instanceJsonRelativeFilePath, newDb.instanceRows]
                            ] as const
                        )
                            .map(
                                ([relativeFilePath, buffer]) => [pathJoin(repoPath, relativeFilePath), buffer] as const
                            )
                            .map(([filePath, rows]) => [filePath, JSON.stringify(rows, null, 4)] as const)
                            .map(([filePath, rowsStr]) => [filePath, Buffer.from(rowsStr, "utf8")] as const)
                            .map(([filePath, buffer]) => fs.promises.writeFile(filePath, buffer))
                    );

                    return {
                        "doCommit": true,
                        "doAddAll": false,
                        "message": commitMessage
                    };
                }
            });
        },
        "updateCompiledData": async ({ newCompiledData, commitMessage }) => {
            await gitSsh({
                "sshUrl": dataRepoSshUrl,
                sshPrivateKeyName,
                sshPrivateKey,
                "shaish": compiledDataBranch,
                "action": ({ repoPath }) => {
                    for (const [relativeJsonFilePath, data] of [
                        [compiledDataPrivateJsonRelativeFilePath, newCompiledData],
                        [compiledDataPublicJsonRelativeFilePath, compiledDataPrivateToPublic(newCompiledData)]
                    ] as const) {
                        fs.writeFileSync(
                            pathJoin(repoPath, relativeJsonFilePath),
                            Buffer.from(JSON.stringify(data, null, 2), "utf8")
                        );
                    }

                    return Promise.resolve({
                        "doCommit": true,
                        "doAddAll": true,
                        "message": commitMessage
                    });
                }
            });
        }
    };

    const initializeDbApiCache = async () => {
        const start = Date.now();

        console.log("Starting dbApi cache initialization...");

        await Promise.all([
            gitSsh({
                "sshUrl": dataRepoSshUrl,
                "shaish": compiledDataBranch,
                sshPrivateKeyName,
                sshPrivateKey,
                "action": async () => ({ "doCommit": false })
            }),
            gitSsh({
                "sshUrl": dataRepoSshUrl,
                sshPrivateKeyName,
                sshPrivateKey,
                "action": async () => ({ "doCommit": false })
            })
        ]);

        console.log(`dbApi cache initialization done in ${Date.now() - start}ms`);
    };

    return {
        dbApi,
        initializeDbApiCache
    };
}
