import type { GetSoftwareExternalDataOptions } from "../../ports/GetSoftwareExternalDataOptions";
import fetch from "node-fetch";
import { freeSoftwareLicensesWikidataIds } from "./getWikidataSoftware";

const useAgent = "Socle interministériel de logiciels libres - Ap";

export const getWikidataSoftwareOptions: GetSoftwareExternalDataOptions = async ({ queryString, language }) => {
    const results: {
        search: {
            id: string;
            display: { description?: { value?: string } };
            label?: string;
        }[];
    } = (await fetch(
        [
            "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json",
            `search=${encodeURIComponent(queryString)}`,
            `language=${language}`
        ].join("&"),
        {
            "headers": {
                "User-Agent": useAgent
            }
        }
    ).then(response => response.json())) as any;

    const arr = results.search.map(entry => ({
        "id": entry.id,
        "description": entry.display.description?.value ?? "",
        "label": entry.label ?? ""
    }));

    const licensesById = await getLicenses(arr.map(({ id }) => id));

    return arr.map(({ id, label, description }) => ({
        externalId: id,
        externalDataOrigin: "wikidata",
        label,
        description,
        "isLibreSoftware": (() => {
            const licenseId = licensesById[id];

            return licenseId === undefined ? false : freeSoftwareLicensesWikidataIds.includes(licenseId);
        })()
    }));
};

async function getLicenses(wikidataIds: string[]) {
    const propertyId = "P275"; // license
    const wikidataIdString = wikidataIds.map(id => "wd:" + id).join(" ");
    const query = `SELECT ?item ?itemLabel ?license ?licenseLabel WHERE {
        VALUES ?item { ${wikidataIdString} }
        ?item wdt:${propertyId} ?license.
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    const headers = { "User-Agent": useAgent };
    const response = await fetch(url, { headers });
    const data = await response.json();

    // Group the results by the Wikidata ID
    const groupedData: Record<
        string,
        {
            item: string;
            itemLabel: string;
            license: string;
            licenseLabel: string;
        }
    > = {};

    data.results.bindings.forEach((binding: any) => {
        const wikidataId = binding.item.value.split("/").pop();
        if (!groupedData[wikidataId]) {
            groupedData[wikidataId] = {
                "item": binding.item.value,
                "itemLabel": binding.itemLabel.value,
                "license": binding.license.value,
                "licenseLabel": binding.licenseLabel.value
            };
        }
    });

    return Object.fromEntries(
        Object.entries(groupedData).map(([wikidataId, { license }]) => [wikidataId, license.split("/").reverse()[0]])
    );
}
