import { Generated, JSONColumnType } from "kysely";
import type { PartialNoOptional } from "../../../../tools/PartialNoOptional";

export type Database = {
    agents: AgentsTable;
    software_referents: SoftwareReferentsTable;
    software_users: SoftwareUsersTable;
    instances: InstancesTable;
    softwares: SoftwaresTable;
    compiled_softwares: CompiledSoftwaresTable;
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

// ---------- compiled data ----------

type ComptoirDuLibreProvider = {
    id: number;
    url: string;
    name: string;
    type: string;
    external_resources: {
        website: string | null;
    };
};

type ComptoirDuLibreUser = {
    id: number;
    url: string;
    name: string;
    type: string;
    external_resources: {
        website: string | null;
    };
};

type ComptoirDuLibreSoftware = {
    softwareId: number;
    comptoirDuLibreId: number;
    logoUrl: string | undefined;
    keywords: string[] | undefined;
    created: string;
    modified: string;
    url: string;
    name: string;
    licence: string;
    external_resources: {
        website: string | null;
        repository: string | null;
    };
    providers: ComptoirDuLibreProvider[];
    users: ComptoirDuLibreUser[];
};

type ServiceProvider = {
    name: string;
    website?: string;
    cdlUrl?: string;
    cnllUrl?: string;
    siren?: string;
};

type ExternalDataDeveloper = {
    name: string;
    id: string;
};

type LocalizedString = string | Partial<Record<string, string>>;

type SoftwareExternalData = {
    externalId: string;
    externalDataOrigin: "wikidata" | "HAL";
    developers: ExternalDataDeveloper[];
    label: LocalizedString;
    description: LocalizedString;
    isLibreSoftware: boolean;
} & PartialNoOptional<{
    logoUrl: string;
    framaLibreId: string;
    websiteUrl: string;
    sourceUrl: string;
    documentationUrl: string;
    license: string;
}>;

type CompiledSoftwaresTable = {
    softwareId: number;
    serviceProviders: JSONColumnType<ServiceProvider[]>;
    softwareExternalData: JSONColumnType<SoftwareExternalData> | null;
    similarExternalSoftwares: JSONColumnType<
        Pick<SoftwareExternalData, "externalId" | "label" | "description" | "isLibreSoftware" | "externalDataOrigin">[]
    >;
    parentWikidataSoftware: JSONColumnType<Pick<SoftwareExternalData, "externalId" | "label" | "description">> | null;
    comptoirDuLibreSoftware: JSONColumnType<ComptoirDuLibreSoftware> | null;
    annuaireCnllServiceProviders: JSONColumnType<
        {
            name: string;
            siren: string;
            url: string;
        }[]
    > | null;
    latestVersion: JSONColumnType<{
        semVer: string;
        publicationTime: number;
    }> | null;
};
