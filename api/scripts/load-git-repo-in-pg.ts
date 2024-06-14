import { Kysely } from "kysely";
import { z } from "zod";
import { createGitDbApi, GitDbApiParams } from "../src/core/adapters/dbApi/createGitDbApi";
import { Database } from "../src/core/adapters/dbApi/kysely/kysely.database";
import { createPgDialect } from "../src/core/adapters/dbApi/kysely/kysely.dialect";
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
        agentIdByEmail: agentIdByEmail,
        db: pgDb
    });
};

const insertSoftwares = async (softwareRows: SoftwareRow[], db: Kysely<Database>) => {
    console.info("Deleting than Inserting softwares");
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
    await db.transaction().execute(async trx => {
        await trx.deleteFrom("agents").execute();
        console.log("number of agents to add : ", agentRows.length);
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

const insertInstances = async ({
    instanceRows,
    agentIdByEmail,
    db
}: {
    instanceRows: Db.InstanceRow[];
    agentIdByEmail: Record<string, number>;
    db: Kysely<Database>;
}) => {
    console.info("Deleting than Inserting instances");
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
