import { Generated, JSONColumnType } from "kysely";

export type Database = {
    agents: AgentsTable;
    software_referents: SoftwareReferentsTable;
    software_users: SoftwareUsersTable;
    instances: InstancesTable;
    softwares: SoftwaresTable;
};

type AgentsTable = {
    id: Generated<number>;
    email: string;
    organization: string;
    about: string | null;
    isPublic: boolean;
};

type SoftwareReferentsTable = {
    softwareId: number;
    agentId: number;
    isExpert: boolean;
    useCaseDescription: string;
    serviceUrl: string | null;
};

type Os = "windows" | "linux" | "mac" | "android" | "ios";

type SoftwareUsersTable = {
    softwareId: number;
    agentId: number;
    useCaseDescription: string;
    os: Os | null;
    version: string;
    serviceUrl: string | null;
};

type InstancesTable = {
    id: number;
    mainSoftwareSillId: number;
    organization: string;
    targetAudience: string;
    publicUrl: string | null;
    otherSoftwareWikidataIds: JSONColumnType<string[]>;
    addedByAgentEmail: string;
    referencedSinceTime: number;
    updateTime: number;
};

type SoftwareType =
    | { type: "cloud" }
    | { type: "stack" }
    | {
          type: "desktop/mobile";
          os: Record<Os, boolean>;
      };

type SoftwaresTable = {
    id: number;
    name: string;
    description: string;
    referencedSinceTime: number;
    updateTime: number;
    dereferencing: JSONColumnType<{
        reason?: string;
        time: number;
        lastRecommendedVersion?: string;
    }> | null;
    isStillInObservation: boolean;
    parentSoftwareWikidataId: string | null;
    doRespectRgaa: boolean | null;
    isFromFrenchPublicService: boolean;
    isPresentInSupportContract: boolean;
    similarSoftwareExternalDataIds: JSONColumnType<string[]>;
    externalId: string | null;
    externalDataOrigin: "wikidata" | "HAL" | null;
    comptoirDuLibreId: number | null;
    license: string;
    softwareType: JSONColumnType<SoftwareType>;
    catalogNumeriqueGouvFrId: string | null;
    versionMin: string;
    workshopUrls: JSONColumnType<string[]>;
    testUrls: JSONColumnType<
        {
            description: string;
            url: string;
        }[]
    >;
    categories: JSONColumnType<string[]>;
    generalInfoMd: string | null;
    addedByAgentEmail: string;
    logoUrl: string | null;
    keywords: JSONColumnType<string[]>;
};
