import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { assert } from "tsafe/assert";
import memoize from "memoizee";
import { noUndefined } from "tsafe/noUndefined";
import { allEquals } from "evt/tools/reducers/allEquals";
import { exclude } from "tsafe/exclude";
import { removeDuplicatesFactory } from "evt/tools/reducers/removeDuplicates";
import { same } from "evt/tools/inDepth/same";
import { createResolveLocalizedString } from "i18nifty/LocalizedString/reactless";
import { id } from "tsafe/id";
import {
    languages,
    type Language,
    type GetSoftwareExternalData,
    type SoftwareExternalData,
    type LocalizedString
} from "../../ports/GetSoftwareExternalData";
import type { Entity, DataValue, LocalizedString as WikiDataLocalizedString } from "../../../tools/WikidataEntity";
const { resolveLocalizedString } = createResolveLocalizedString({
    "currentLanguage": id<Language>("en"),
    "fallbackLanguage": "en"
});

export const getWikidataSoftware: GetSoftwareExternalData = memoize(
    async (wikidataId): Promise<SoftwareExternalData | undefined> => {
        const { entity } =
            (await fetchEntity(wikidataId).catch(error => {
                if (error instanceof WikidataFetchError) {
                    if (error.status === 404 || error.status === undefined) {
                        return undefined;
                    }
                    throw error;
                }
            })) ?? {};

        if (entity === undefined) {
            return undefined;
        }

        const { getClaimDataValue } = createGetClaimDataValue({ entity });

        const license = await (async () => {
            const licenseId = getClaimDataValue<"wikibase-entityid">("P275")[0]?.id;

            if (licenseId === undefined) {
                return undefined;
            }

            const { entity } = await fetchEntity(licenseId).catch(() => ({ "entity": undefined }));

            if (entity === undefined) {
                return undefined;
            }

            return { "label": entity.aliases.en?.[0]?.value, "id": licenseId };
        })();

        return {
            externalId: wikidataId,
            externalDataOrigin: "wikidata",
            "label": wikidataSingleLocalizedStringToLocalizedString(entity.labels) ?? {
                "en": "No label"
            },
            "description": wikidataSingleLocalizedStringToLocalizedString(entity.descriptions) ?? {
                "en": "No description"
            },
            "logoUrl": await (async () => {
                const value = getClaimDataValue<"string">("P154")[0];

                if (value === undefined) {
                    return undefined;
                }

                const previewUrl = encodeURI(`https://www.wikidata.org/wiki/${wikidataId}#/media/File:${value}`);

                const raw = await (async function callee(): Promise<string | undefined> {
                    const res = await fetch(previewUrl).catch(() => undefined);

                    if (res === undefined) {
                        return undefined;
                    }

                    // Too many requests
                    if (res.status === 429) {
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        return callee();
                    }

                    if (res.status !== 200) {
                        console.error(`Request to ${previewUrl} failed with error code ${res.status}`);
                        return undefined;
                    }

                    const raw = await res.text().catch(() => undefined);

                    if (raw === undefined) {
                        return undefined;
                    }

                    return raw;
                })();

                if (raw === undefined) {
                    return undefined;
                }

                const $ = cheerio.load(raw);

                const endOfHref =
                    "File:" +
                    encodeURIComponent(value)
                        .replace(/%2C/g, ",") //Preserve ','
                        .replace(/%20/g, "_") //Replace ' ' by '_'
                        .replace(/'/g, "%27"); //Replace ''' by '%27'

                const url = $(`a[href$="${endOfHref}"] img`).attr("src");

                assert(
                    url !== undefined,
                    `Wikidata scrapper needs to be updated ${previewUrl} ${value}, endOfHref: ${endOfHref}`
                );

                return url;
            })(),
            "framaLibreId": getClaimDataValue<"string">("P4107")[0],
            ...(() => {
                const websiteUrl = getClaimDataValue<"string">("P856")[0];
                const sourceUrl = getClaimDataValue<"string">("P1324")[0];

                return {
                    sourceUrl,
                    "websiteUrl": sourceUrl !== websiteUrl ? websiteUrl : undefined
                };
            })(),
            "documentationUrl": getClaimDataValue<"string">("P2078")[0],
            "license": license?.label,
            "isLibreSoftware": license === undefined ? false : freeSoftwareLicensesWikidataIds.includes(license.id),
            "developers": await Promise.all(
                [
                    ...getClaimDataValue<"wikibase-entityid">("P50"),
                    ...getClaimDataValue<"wikibase-entityid">("P170"),
                    ...getClaimDataValue<"wikibase-entityid">("P172"),
                    ...getClaimDataValue<"wikibase-entityid">("P178")
                ].map(async ({ id }) => {
                    const { entity } = await fetchEntity(id).catch(() => ({ "entity": undefined }));
                    if (entity === undefined) {
                        return undefined;
                    }

                    /*
					const { getClaimDataValue } = createGetClaimDataValue({
						entity,
					});
	
					const isHuman =
						getClaimDataValue<"wikibase-entityid">("P31").find(
							({ id }) => id === "Q5",
						) !== undefined;
	
					if (!isHuman) {
						return undefined;
					}
					*/

                    const name = (() => {
                        const { shortName } = (() => {
                            const { getClaimDataValue } = createGetClaimDataValue({
                                entity
                            });

                            const shortName = getClaimDataValue<"text-language">("P1813")[0]?.text;

                            return { shortName };
                        })();

                        if (shortName !== undefined) {
                            return shortName;
                        }

                        const label = wikidataSingleLocalizedStringToLocalizedString(entity.labels);

                        if (label === undefined) {
                            return undefined;
                        }

                        return resolveLocalizedString(label);
                    })();

                    if (name === undefined) {
                        return undefined;
                    }

                    return {
                        name,
                        "id": entity.id
                    };
                })
            ).then(developers =>
                developers.filter(exclude(undefined)).reduce(
                    ...(() => {
                        const { removeDuplicates } = removeDuplicatesFactory({
                            "areEquals": same
                        });

                        return removeDuplicates<SoftwareExternalData["developers"][number]>();
                    })()
                )
            )
        };
    },
    {
        "promise": true,
        "maxAge": 3 * 3600 * 1000
    }
);

function wikidataSingleLocalizedStringToLocalizedString(
    wikidataSingleLocalizedString: WikiDataLocalizedString.Single
): LocalizedString | undefined {
    const localizedString = noUndefined(
        Object.fromEntries(languages.map(language => [language, wikidataSingleLocalizedString[language]?.value]))
    );

    if (Object.keys(localizedString).length === 0) {
        return wikidataSingleLocalizedString[Object.keys(wikidataSingleLocalizedString)[0]]?.value;
    }

    if (Object.values(localizedString).reduce(...allEquals())) {
        return localizedString[Object.keys(localizedString)[0]];
    }

    return localizedString;
}

export class WikidataFetchError extends Error {
    constructor(public readonly status: number | undefined) {
        super(`Wikidata fetch error status: ${status}`);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

async function fetchEntity(wikidataId: string): Promise<{ entity: Entity }> {
    const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`).catch(
        () => undefined
    );

    if (res === undefined) {
        throw new WikidataFetchError(undefined);
    }

    if (res.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return fetchEntity(wikidataId);
    }

    if (res.status === 404) {
        throw new WikidataFetchError(res.status);
    }

    const json = await res.json();

    const entity = Object.values(json["entities"])[0] as Entity;

    return { entity };
}

function createGetClaimDataValue(params: { entity: Entity }) {
    const { entity } = params;

    function getClaimDataValue<Type extends "string" | "wikibase-entityid" | "text-language">(property: `P${number}`) {
        const statementClaim = entity.claims[property];

        if (statementClaim === undefined) {
            return [];
        }

        return statementClaim
            .filter(x => x.rank !== "deprecated")
            .sort((a, b) => {
                const getWeight = (rank: (typeof a)["rank"]) => (rank === "preferred" ? 1 : 0);
                return getWeight(b.rank) - getWeight(a.rank);
            })
            .filter(x => x.mainsnak.snaktype === "value")
            .map(x => (x.mainsnak.datavalue as DataValue<Type>).value);
    }

    return { getClaimDataValue };
}

// Array of Free Software Licenses and their corresponding Wikidata IDs
export const freeSoftwareLicensesWikidataIds = [
    // Apache License 2.0
    "Q309877",

    // BSD 2-Clause "Simplified" License
    "Q1507844",

    // BSD 3-Clause "New" or "Revised" License
    "Q1507824",

    // Eclipse Public License 2.0
    "Q5184255",

    // European Union Public License 1.2
    "Q65267454",

    // GNU Affero General Public License v3.0 only
    "Q1277061",

    // GNU Affero General Public License v3.0 or later
    "Q38926",

    // GNU General Public License v3.0 or later
    "Q2464622",

    // GNU Lesser General Public License v3.0 or later
    "Q39015",

    // MIT License
    "Q334661",

    // Mozilla Public License 2.0
    "Q334062",

    // CeCILL-B Free Software License Agreement
    "Q5099871",

    // CeCILL-C Free Software License Agreement
    "Q5099874",

    // CeCILL Free Software License Agreement v2.1
    "Q369616",

    // Academic Free License v3.0
    "Q467700",

    // Apache License 1.1
    "Q309884",

    // Apple Public Source License 2.0
    "Q466388",

    // Artistic License 2.0
    "Q6938433",

    // Boost Software License 1.0
    "Q333029",

    // Common Development and Distribution License 1.0
    "Q334209",

    // Common Public Attribution License 1.0
    "Q332884",

    // Common Public License 1.0
    "Q334393",

    // EU DataGrid Software License
    "Q5334061",

    // Eclipse Public License 1.0
    "Q334083",

    // Educational Community License v2.0
    "Q5358492",

    // Eiffel Forum License v2.0
    "Q465952",

    // European Union Public License 1.1
    "Q65267453",

    // GNU General Public License v2.0 only
    "Q7590",

    // GNU General Public License v2.0 or later
    "Q7553",

    // GNU General Public License v3.0 only
    "Q7571",

    // GNU Lesser General Public License v2.1 only
    "Q7547",

    // GNU Lesser General Public License v2.1 or later
    "Q30245",

    // GNU Lesser General Public License v3.0 only
    "Q7539",

    // GNU General Public License, version 3.0
    "Q10513445",

    // IBM Public License v1.0
    "Q467144",

    // ISC License
    "Q330779",

    // Intel Open Source License
    "Q607106",

    // Microsoft Public License
    "Q33057",

    // Microsoft Reciprocal License
    "Q33058",

    // Mozilla Public License 1.1
    "Q334395",

    // Open Software License 3.0
    "Q335473",

    // Python License 2.0
    "Q72189",

    // Q Public License 1.0
    "Q321678",

    // SIL Open Font License 1.1
    "Q55980",

    // Sun Public License v1.0
    "Q332889",

    // The Unlicense
    "Q6938435",

    // Universal Permissive License v1.0
    "Q107081891",

    // University of Illinois/NCSA Open Source License
    "Q667009",

    // Zlib License
    "Q207149",

    // Zope Public License 2.0
    "Q336266",

    // BSD licenses
    "Q191307"
];
