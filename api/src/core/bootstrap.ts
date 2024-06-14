import { createCore, createObjectThatThrowsIfAccessed, type GenericCore } from "redux-clean-architecture";
import { createCompileData } from "./adapters/compileData";
import { comptoirDuLibreApi } from "./adapters/comptoirDuLibreApi";
import { createGitDbApi, type GitDbApiParams } from "./adapters/dbApi/createGitDbApi";
import { InMemoryDbApi } from "./adapters/dbApi/InMemoryDbApi";
import { getCnllPrestatairesSill } from "./adapters/getCnllPrestatairesSill";
import { getServiceProviders } from "./adapters/getServiceProviders";
import { createGetSoftwareLatestVersion } from "./adapters/getSoftwareLatestVersion";
import { getWikidataSoftware } from "./adapters/wikidata/getWikidataSoftware";
import { getWikidataSoftwareOptions } from "./adapters/wikidata/getWikidataSoftwareOptions";
import { getHalSoftware } from "./adapters/hal/getHalSoftware";
import { getHalSoftwareOptions } from "./adapters/hal/getHalSoftwareOptions";
import { createKeycloakUserApi, type KeycloakUserApiParams } from "./adapters/userApi";
import type { CompileData } from "./ports/CompileData";
import type { ComptoirDuLibreApi } from "./ports/ComptoirDuLibreApi";
import { DbApi, Db } from "./ports/DbApi";
import type { ExternalDataOrigin, GetSoftwareExternalData } from "./ports/GetSoftwareExternalData";
import type { GetSoftwareExternalDataOptions } from "./ports/GetSoftwareExternalDataOptions";
import type { GetSoftwareLatestVersion } from "./ports/GetSoftwareLatestVersion";
import type { UserApi } from "./ports/UserApi";
import { usecases } from "./usecases";

type GitDbConfig = { dbKind: "git" } & GitDbApiParams;
type InMemoryDbConfig = { dbKind: "inMemory" };

type DbConfig = GitDbConfig | InMemoryDbConfig;

type ParamsOfBootstrapCore = {
    dbConfig: DbConfig;
    keycloakUserApiParams: KeycloakUserApiParams | undefined;
    githubPersonalAccessTokenForApiRateLimit: string;
    doPerPerformPeriodicalCompilation: boolean;
    doPerformCacheInitialization: boolean;
    externalSoftwareDataOrigin: ExternalDataOrigin;
};

export type Context = {
    paramsOfBootstrapCore: ParamsOfBootstrapCore;
    dbApi: DbApi;
    userApi: UserApi;
    compileData: CompileData;
    comptoirDuLibreApi: ComptoirDuLibreApi;
    getSoftwareExternalDataOptions: GetSoftwareExternalDataOptions;
    getSoftwareExternalData: GetSoftwareExternalData;
    getSoftwareLatestVersion: GetSoftwareLatestVersion;
};

export type Core = GenericCore<typeof usecases, Context>;

export type State = Core["types"]["State"];
export type Thunks = Core["types"]["Thunks"];
export type CreateEvt = Core["types"]["CreateEvt"];

const getDbApiAndInitializeCache = (dbConfig: DbConfig): Db.DbApiAndInitializeCache => {
    if (dbConfig.dbKind === "git") return createGitDbApi(dbConfig);
    if (dbConfig.dbKind === "inMemory")
        return {
            dbApi: new InMemoryDbApi(),
            initializeDbApiCache: async () => {}
        };
    const shouldNotBeReached: never = dbConfig;
    throw new Error(`Unsupported case: ${shouldNotBeReached}`);
};

export async function bootstrapCore(params: ParamsOfBootstrapCore): Promise<{ core: Core; context: Context }> {
    const {
        dbConfig,
        keycloakUserApiParams,
        githubPersonalAccessTokenForApiRateLimit,
        doPerPerformPeriodicalCompilation,
        doPerformCacheInitialization,
        externalSoftwareDataOrigin
    } = params;

    const { getSoftwareLatestVersion } = createGetSoftwareLatestVersion({
        githubPersonalAccessTokenForApiRateLimit
    });

    const { getSoftwareExternalDataOptions, getSoftwareExternalData } =
        getSoftwareExternalDataFunctions(externalSoftwareDataOrigin);

    const { compileData } = createCompileData({
        getSoftwareExternalData,
        getCnllPrestatairesSill,
        comptoirDuLibreApi,
        getSoftwareLatestVersion,
        getServiceProviders
    });

    const { dbApi, initializeDbApiCache } = getDbApiAndInitializeCache(dbConfig);

    const { userApi, initializeUserApiCache } =
        keycloakUserApiParams === undefined
            ? {
                  "userApi": createObjectThatThrowsIfAccessed<Context["userApi"]>({
                      "debugMessage": "No Keycloak server"
                  }),
                  "initializeUserApiCache": async () => {}
              }
            : createKeycloakUserApi(keycloakUserApiParams);

    const context: Context = {
        "paramsOfBootstrapCore": params,
        dbApi,
        userApi,
        compileData,
        comptoirDuLibreApi,
        getSoftwareExternalDataOptions,
        getSoftwareExternalData,
        getSoftwareLatestVersion
    };

    const { core, dispatch } = createCore({
        context,
        usecases
    });

    await dispatch(
        usecases.readWriteSillData.protectedThunks.initialize({
            doPerPerformPeriodicalCompilation
        })
    );

    if (doPerformCacheInitialization) {
        console.log("Performing cache initialization...");

        await Promise.all([initializeDbApiCache(), initializeUserApiCache()]);
    }

    return { core, context };
}

function getSoftwareExternalDataFunctions(externalSoftwareDataOrigin: ExternalDataOrigin): {
    "getSoftwareExternalDataOptions": GetSoftwareExternalDataOptions;
    "getSoftwareExternalData": GetSoftwareExternalData;
} {
    switch (externalSoftwareDataOrigin) {
        case "wikidata":
            return {
                "getSoftwareExternalDataOptions": getWikidataSoftwareOptions,
                "getSoftwareExternalData": getWikidataSoftware
            };
        case "HAL":
            return {
                "getSoftwareExternalDataOptions": getHalSoftwareOptions,
                "getSoftwareExternalData": getHalSoftware
            };
        default:
            const unreachableCase: never = externalSoftwareDataOrigin;
            throw new Error(`Unreachable case: ${unreachableCase}`);
    }
}
