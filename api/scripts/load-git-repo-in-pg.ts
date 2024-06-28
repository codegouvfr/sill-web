import { Kysely } from "kysely";
import { z } from "zod";
import { createGitDbApi, GitDbApiParams } from "../src/core/adapters/dbApi/createGitDbApi";
import { Database } from "../src/core/adapters/dbApi/kysely/kysely.database";
import { createPgDialect } from "../src/core/adapters/dbApi/kysely/kysely.dialect";
import { CompiledData } from "../src/core/ports/CompileData";
import { Db } from "../src/core/ports/DbApi";
import SoftwareRow = Db.SoftwareRow;

export type Params = {
    pgConfig: { dbUrl: string };
    gitDbConfig: GitDbApiParams;
};

const saveGitDbInPostgres = async ({ pgConfig, gitDbConfig }: Params) => {
    const { dbApi: gitDbApi } = createGitDbApi(gitDbConfig);
    if (!pgConfig.dbUrl) throw new Error("Missing PG database url, please set the DATABASE_URL environnement variable");
    const pgDb = new Kysely<Database>({ dialect: createPgDialect(pgConfig.dbUrl) });

    const { softwareRows, agentRows, softwareReferentRows, softwareUserRows, instanceRows } = await gitDbApi.fetchDb();

    await insertSoftwares(softwareRows, pgDb);
    await insertAgents(agentRows, pgDb);

    const agentIdByEmail = await makeGetAgentIdByEmail(pgDb);
    await insertSoftwareReferents({
        softwareReferentRows: softwareReferentRows,
        agentIdByEmail: agentIdByEmail,
        db: pgDb
    });
    await insertSoftwareUsers({
        softwareUserRows: softwareUserRows,
        agentIdByEmail: agentIdByEmail,
        db: pgDb
    });
    await insertInstances({
        instanceRows: instanceRows,
        db: pgDb
    });

    const compiledSoftwares = await gitDbApi.fetchCompiledData();
    await insertCompiledSoftwares(compiledSoftwares, pgDb);
};

const insertSoftwares = async (softwareRows: SoftwareRow[], db: Kysely<Database>) => {
    console.info("Deleting than Inserting softwares");
    console.info("Number of softwares to insert : ", softwareRows.length);
    await db.transaction().execute(async trx => {
        await trx.deleteFrom("softwares").execute();
        await trx
            .insertInto("softwares")
            .values(
                softwareRows.map(row => ({
                    ...row,
                    dereferencing: row.dereferencing ? JSON.stringify(row.dereferencing) : null,
                    similarSoftwareExternalDataIds: JSON.stringify(row.similarSoftwareExternalDataIds),
                    softwareType: JSON.stringify(row.softwareType),
                    workshopUrls: JSON.stringify(row.workshopUrls),
                    testUrls: JSON.stringify(row.testUrls),
                    categories: JSON.stringify(row.categories),
                    keywords: JSON.stringify(row.keywords)
                }))
            )
            .executeTakeFirst();
    });
};

const insertAgents = async (agentRows: Db.AgentRow[], db: Kysely<Database>) => {
    console.log("Deleting than Inserting agents");
    console.info("Number of agents to insert : ", agentRows.length);
    await db.transaction().execute(async trx => {
        await trx.deleteFrom("agents").execute();
        await trx.insertInto("agents").values(agentRows).executeTakeFirst();
    });
};

const makeGetAgentIdByEmail = async (db: Kysely<Database>): Promise<Record<string, number>> => {
    console.info("Fetching agents, to map email to id");
    const agents = await db.selectFrom("agents").select(["email", "id"]).execute();
    return agents.reduce((acc, agent) => ({ ...acc, [agent.email]: agent.id }), {});
};

const insertSoftwareReferents = async ({
    softwareReferentRows,
    agentIdByEmail,
    db
}: {
    softwareReferentRows: Db.SoftwareReferentRow[];
    agentIdByEmail: Record<string, number>;
    db: Kysely<Database>;
}) => {
    console.info("Deleting than Inserting software referents");
    console.info("Number of software referents to insert : ", softwareReferentRows.length);
    await db.transaction().execute(async trx => {
        await trx.deleteFrom("software_referents").execute();
        await trx
            .insertInto("software_referents")
            .values(
                softwareReferentRows.map(({ agentEmail, ...rest }) => ({
                    ...rest,
                    agentId: agentIdByEmail[agentEmail]
                }))
            )
            .executeTakeFirst();
    });
};

const insertSoftwareUsers = async ({
    softwareUserRows,
    agentIdByEmail,
    db
}: {
    softwareUserRows: Db.SoftwareUserRow[];
    agentIdByEmail: Record<string, number>;
    db: Kysely<Database>;
}) => {
    console.info("Deleting than Inserting software users");
    console.info("Number of software users to insert : ", softwareUserRows.length);
    await db.transaction().execute(async trx => {
        await trx.deleteFrom("software_users").execute();
        await trx
            .insertInto("software_users")
            .values(
                softwareUserRows.map(({ agentEmail, ...rest }) => ({
                    ...rest,
                    agentId: agentIdByEmail[agentEmail]
                }))
            )
            .executeTakeFirst();
    });
};

const insertInstances = async ({ instanceRows, db }: { instanceRows: Db.InstanceRow[]; db: Kysely<Database> }) => {
    console.info("Deleting than Inserting instances");
    console.info("Number of instances to insert : ", instanceRows.length);
    await db.transaction().execute(async trx => {
        await trx.deleteFrom("instances").execute();
        await trx
            .insertInto("instances")
            .values(
                instanceRows.map(row => ({
                    ...row,
                    otherSoftwareWikidataIds: JSON.stringify(row.otherSoftwareWikidataIds)
                }))
            )
            .executeTakeFirst();
    });
};

const insertCompiledSoftwares = async (
    compiledSoftwares: CompiledData.Software<"private">[],
    pgDb: Kysely<Database>
) => {
    console.info("Deleting than Inserting compiled softwares");
    console.info("Number of compiled softwares to insert : ", compiledSoftwares.length);
    await pgDb.transaction().execute(async trx => {
        await trx.deleteFrom("compiled_softwares").execute();
        await trx
            .insertInto("compiled_softwares")
            .values(
                compiledSoftwares.map(software => ({
                    softwareId: software.id,
                    serviceProviders: JSON.stringify(software.serviceProviders),
                    softwareExternalData: JSON.stringify(software.softwareExternalData),
                    similarExternalSoftwares: JSON.stringify(software.similarExternalSoftwares),
                    parentWikidataSoftware: JSON.stringify(software.parentWikidataSoftware),
                    comptoirDuLibreSoftware: JSON.stringify(software.comptoirDuLibreSoftware),
                    annuaireCnllServiceProviders: JSON.stringify(software.annuaireCnllServiceProviders),
                    latestVersion: JSON.stringify(software.latestVersion)
                }))
            )
            .executeTakeFirst();
    });
};

const paramsSchema: z.Schema<Params> = z.object({
    pgConfig: z.object({
        dbUrl: z.string()
    }),
    gitDbConfig: z.object({
        dataRepoSshUrl: z.string(),
        sshPrivateKey: z.string(),
        sshPrivateKeyName: z.string()
    })
});

const timerName = "Script duration";
console.time(timerName);

saveGitDbInPostgres(
    paramsSchema.parse({
        pgConfig: { dbUrl: process.env.DATABASE_URL },
        gitDbConfig: {
            dataRepoSshUrl: process.env.SILL_DATA_REPO_SSH_URL,
            sshPrivateKey: process.env.SILL_SSH_PRIVATE_KEY,
            sshPrivateKeyName: process.env.SILL_SSH_NAME
        }
    })
)
    .then(() => {
        console.log("Load git db in postgres with success");
        process.exit(0);
    })
    .finally(() => console.timeEnd(timerName));
