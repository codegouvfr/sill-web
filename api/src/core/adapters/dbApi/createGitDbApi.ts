import type { DbApi, Db } from "../../ports/DbApi";
import { gitSsh } from "../../../tools/gitSsh";
import { Deferred } from "evt/tools/Deferred";
import { type CompiledData, compiledDataPrivateToPublic } from "../../ports/CompileData";
import * as fs from "fs";
import { join as pathJoin } from "path";
import type { ReturnType } from "tsafe";

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

export type GitDbApiParams = {
    dataRepoSshUrl: string;
    sshPrivateKeyName: string;
    sshPrivateKey: string;
};

export function createGitDbApi(params: GitDbApiParams): Db.DbApiAndInitializeCache {
    const { dataRepoSshUrl, sshPrivateKeyName, sshPrivateKey } = params;

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
        "fetchDb": () => {
            const dOut = new Deferred<Db>();

            gitSsh({
                "sshUrl": dataRepoSshUrl,
                sshPrivateKeyName,
                sshPrivateKey,
                "action": async ({ repoPath }) => {
                    const [softwareRows, agentRows, softwareReferentRows, softwareUserRows, instanceRows] =
                        await Promise.all(
                            [
                                softwareJsonRelativeFilePath,
                                agentJsonRelativeFilePath,
                                softwareReferentJsonRelativeFilePath,
                                softwareUserJsonRelativeFilePath,
                                instanceJsonRelativeFilePath
                            ]
                                .map(relativeFilePath => pathJoin(repoPath, relativeFilePath))
                                .map(filePath => fs.promises.readFile(filePath))
                        ).then(buffers => buffers.map(buffer => JSON.parse(buffer.toString("utf8"))));

                    dOut.resolve({
                        softwareRows,
                        agentRows,
                        softwareReferentRows,
                        softwareUserRows,
                        instanceRows
                    });

                    return { "doCommit": false };
                }
            }).catch(error => dOut.reject(error));

            return dOut.pr;
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
