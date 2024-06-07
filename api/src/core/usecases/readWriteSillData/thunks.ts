import structuredClone from "@ungap/structured-clone";
import type { Thunks } from "../../bootstrap";
import { createUsecaseContextApi } from "redux-clean-architecture";
import { Mutex } from "async-mutex";
import { assert, type Equals } from "tsafe/assert";
import type { Db } from "../../ports/DbApi";
import { same } from "evt/tools/inDepth/same";
import { Deferred } from "evt/tools/Deferred";
import * as suggestionAndAutoFill from "../suggestionAndAutoFill";
import { objectKeys } from "tsafe/objectKeys";
import { name, actions } from "./state";
import type { SoftwareFormData, DeclarationFormData, InstanceFormData, Agent } from "./types";
import { selectors } from "./selectors";

const { getContext } = createUsecaseContextApi(() => ({
    "mutex": new Mutex()
}));

export const protectedThunks = {
    "initialize":
        (params: { doPerPerformPeriodicalCompilation: boolean }) =>
        async (...args) => {
            const { doPerPerformPeriodicalCompilation } = params;

            const [dispatch, getState, rootContext] = args;

            const { dbApi, evtAction } = rootContext;

            const [db, compiledData] = await Promise.all([dbApi.fetchDb(), dbApi.fetchCompiledData()]);

            dispatch(
                actions.updated({
                    db,
                    compiledData
                })
            );

            periodical_compilation: {
                if (!doPerPerformPeriodicalCompilation) {
                    console.log("Periodical compilation disabled");
                    break periodical_compilation;
                }

                console.log("Periodical update enabled");

                dispatch(privateThunks.triggerNonIncrementalCompilation({ "triggerType": "initial" }));

                setInterval(
                    async () => {
                        try {
                            dispatch(privateThunks.triggerNonIncrementalCompilation({ "triggerType": "periodical" }));
                        } catch (error) {
                            console.error(`Non incremental periodical compilation failed: ${String(error)}`);
                        }
                    },
                    4 * 3600 * 1000 //4 hour
                );
            }

            evtAction
                .pipe(action => action.usecaseName === name && action.actionName === "updated")
                .toStateful()
                .attach(() => {
                    setTimeout(() => {
                        const start = Date.now();

                        console.log("Starting cache refresh of readWriteSillData selectors");

                        objectKeys(selectors).forEach(selectorName => selectors[selectorName](getState()));

                        console.log(`Cache refresh of readWriteSillData selectors done in ${Date.now() - start}ms`);
                    }, 500);
                });
        }
} satisfies Thunks;

export const thunks = {
    "manuallyTriggerNonIncrementalCompilation":
        () =>
        async (...args) => {
            const [dispatch] = args;

            await dispatch(privateThunks.triggerNonIncrementalCompilation({ "triggerType": "manual" }));
        },
    "notifyPushOnMainBranch":
        (params: { commitMessage: string }) =>
        async (...args) => {
            const { commitMessage } = params;

            const [dispatch, , { dbApi }] = args;

            await dispatch(
                privateThunks.transaction(async () => ({
                    "newDb": await dbApi.fetchDb(),
                    commitMessage
                }))
            );
        },
    "createSoftware":
        (params: { formData: SoftwareFormData; agent: { email: string; organization: string } }) =>
        async (...args) => {
            const [dispatch] = args;

            const { formData } = params;

            const agentRow = { ...params.agent };

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { softwareRows, agentRows } = newDb;

                    assert(
                        softwareRows.find(s => {
                            const t = (name: string) => name.toLowerCase().replace(/ /g, "-");
                            return t(s.name) === t(formData.softwareName);
                        }) === undefined,
                        "There is already a software with this name"
                    );

                    const softwareId =
                        newDb.softwareRows.map(({ id }) => id).reduce((prev, curr) => Math.max(prev, curr), 0) + 1;

                    const now = Date.now();

                    softwareRows.push({
                        "id": softwareId,
                        "name": formData.softwareName,
                        "description": formData.softwareDescription,
                        "referencedSinceTime": now,
                        "updateTime": now,
                        "dereferencing": undefined,
                        "isStillInObservation": false,
                        "parentSoftwareWikidataId": undefined,
                        "doRespectRgaa": formData.doRespectRgaa,
                        "isFromFrenchPublicService": formData.isFromFrenchPublicService,
                        "isPresentInSupportContract": formData.isPresentInSupportContract,
                        "similarSoftwareExternalDataIds": formData.similarSoftwareExternalDataIds,
                        "externalId": formData.externalId,
                        "comptoirDuLibreId": formData.comptoirDuLibreId,
                        "license": formData.softwareLicense,
                        "softwareType": formData.softwareType,
                        "catalogNumeriqueGouvFrId": undefined,
                        "versionMin": formData.softwareMinimalVersion,
                        "workshopUrls": [],
                        "testUrls": [],
                        "categories": [],
                        "generalInfoMd": undefined,
                        "addedByAgentEmail": agentRow.email,
                        "logoUrl": await dispatch(
                            privateThunks.getStorableLogo({
                                "externalId": formData.externalId,
                                "logoUrlFromFormData": formData.softwareLogoUrl
                            })
                        ),
                        "keywords": formData.softwareKeywords
                    });

                    if (agentRows.find(({ email }) => email === agentRow.email) === undefined) {
                        agentRows.push({
                            "email": agentRow.email,
                            "organization": agentRow.organization,
                            "about": undefined,
                            "isPublic": false
                        });
                    }

                    return {
                        newDb,
                        "commitMessage": `Add software: ${formData.softwareName}`
                    };
                })
            );
        },
    "updateSoftware":
        (params: {
            softwareSillId: number;
            formData: SoftwareFormData;
            agent: { email: string; organization: string };
        }) =>
        async (...args): Promise<void> => {
            const [dispatch, getState] = args;

            const { softwareSillId, formData, agent } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { softwareRows, softwareReferentRows } = newDb;

                    assert(
                        softwareReferentRows.find(({ agentEmail }) => agentEmail === agentEmail) !== undefined,
                        "The user is not a referent of this software"
                    );

                    const index = softwareRows.findIndex(softwareRow => softwareRow.id === softwareSillId);

                    assert(index !== -1, "The software does not exist");

                    let commitMessage = `${softwareRows[index].name} updated by ${agent.email}`;

                    {
                        const {
                            id,
                            referencedSinceTime,
                            dereferencing,
                            isStillInObservation,
                            parentSoftwareWikidataId,
                            addedByAgentEmail,
                            catalogNumeriqueGouvFrId,
                            categories,
                            generalInfoMd,
                            testUrls,
                            workshopUrls,
                            logoUrl: logoUrlFromDb
                        } = softwareRows[index];

                        const {
                            comptoirDuLibreId,
                            isFromFrenchPublicService,
                            isPresentInSupportContract,
                            similarSoftwareExternalDataIds,
                            softwareDescription,
                            softwareLicense,
                            softwareMinimalVersion,
                            softwareName,
                            softwareType,
                            externalId,
                            softwareLogoUrl: logoUrlFromFormData,
                            softwareKeywords,
                            doRespectRgaa,
                            ...rest
                        } = formData;

                        assert<Equals<typeof rest, {}>>();

                        softwareRows[index] = {
                            id,
                            referencedSinceTime,
                            "updateTime": Date.now(),
                            dereferencing,
                            isStillInObservation,
                            parentSoftwareWikidataId,
                            doRespectRgaa,
                            addedByAgentEmail,
                            catalogNumeriqueGouvFrId,
                            categories,
                            generalInfoMd,
                            testUrls,
                            workshopUrls,
                            comptoirDuLibreId,
                            isFromFrenchPublicService,
                            isPresentInSupportContract,
                            similarSoftwareExternalDataIds,
                            "description": softwareDescription,
                            "license": softwareLicense,
                            "versionMin": softwareMinimalVersion,
                            "name": softwareName,
                            "softwareType": softwareType,
                            externalId,
                            "logoUrl": (() => {
                                const state = getState()[name];

                                const software = state.compiledData.find(({ id }) => id === softwareSillId);

                                assert(software !== undefined);

                                if (software.logoUrl === logoUrlFromDb) {
                                    return logoUrlFromDb;
                                }

                                return logoUrlFromFormData;
                            })(),
                            "keywords": softwareKeywords
                        };
                    }

                    return {
                        commitMessage,
                        newDb
                    };
                })
            );
        },
    "createUserOrReferent":
        (params: {
            softwareName: string;
            formData: DeclarationFormData;
            agent: { email: string; organization: string };
        }) =>
        async (...args): Promise<void> => {
            const [dispatch] = args;

            const { formData, softwareName, agent } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { agentRows, softwareReferentRows, softwareUserRows, softwareRows } = newDb;

                    const softwareRow = softwareRows.find(row => row.name === softwareName);

                    assert(softwareRow !== undefined, "Software not in SILL");

                    if (agentRows.find(row => row.email === agent.email) === undefined) {
                        agentRows.push({
                            "email": agent.email,
                            "organization": agent.organization,
                            "about": undefined,
                            "isPublic": false
                        });
                    }

                    switch (formData.declarationType) {
                        case "referent":
                            {
                                assert(
                                    softwareReferentRows.find(
                                        row => row.softwareId === softwareRow.id && row.agentEmail === agent.email
                                    ) === undefined,
                                    "Agent already referent of this software"
                                );

                                softwareReferentRows.push({
                                    "softwareId": softwareRow.id,
                                    "agentEmail": agent.email,
                                    "isExpert": formData.isTechnicalExpert,
                                    "serviceUrl": formData.serviceUrl,
                                    "useCaseDescription": formData.usecaseDescription
                                });
                            }
                            break;
                        case "user":
                            {
                                assert(
                                    softwareUserRows.find(
                                        row => row.softwareId === softwareRow.id && row.agentEmail === agent.email
                                    ) === undefined,
                                    "Agent already declared as user of this software"
                                );

                                softwareUserRows.push({
                                    "softwareId": softwareRow.id,
                                    "agentEmail": agent.email,
                                    "os": formData.os,
                                    "serviceUrl": formData.serviceUrl,
                                    "useCaseDescription": formData.usecaseDescription,
                                    "version": formData.version
                                });
                            }
                            break;
                    }

                    return {
                        newDb,
                        "commitMessage": `Add ${agent.email} as ${formData.declarationType} of ${softwareName}`
                    };
                })
            );
        },
    "removeUserOrReferent":
        (params: { softwareName: string; declarationType: "user" | "referent"; agentEmail: string }) =>
        async (...args): Promise<void> => {
            const [dispatch] = args;

            const { softwareName, declarationType, agentEmail } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { agentRows, softwareReferentRows, softwareUserRows, softwareRows, instanceRows } = newDb;

                    const softwareRow = softwareRows.find(row => row.name === softwareName);

                    assert(softwareRow !== undefined, `There is no ${softwareName} in SILL`);

                    const softwareDeclarationRows = ((): { agentEmail: string; softwareId: number }[] => {
                        switch (declarationType) {
                            case "referent":
                                return softwareReferentRows;
                            case "user":
                                return softwareUserRows;
                        }
                    })();

                    const softwareDeclarationRow = softwareDeclarationRows.find(
                        row => row.agentEmail === agentEmail && row.softwareId === softwareRow.id
                    );

                    assert(
                        softwareDeclarationRow !== undefined,
                        `There is no ${agentEmail} as ${declarationType} of ${softwareName}`
                    );

                    softwareDeclarationRows.splice(softwareDeclarationRows.indexOf(softwareDeclarationRow), 1);

                    remove_agent_if_no_longer_referenced_anywhere: {
                        if (softwareReferentRows.find(row => row.agentEmail === agentEmail) !== undefined) {
                            break remove_agent_if_no_longer_referenced_anywhere;
                        }

                        if (softwareUserRows.find(row => row.agentEmail === agentEmail) !== undefined) {
                            break remove_agent_if_no_longer_referenced_anywhere;
                        }

                        if (softwareRows.find(row => row.addedByAgentEmail === agentEmail) !== undefined) {
                            break remove_agent_if_no_longer_referenced_anywhere;
                        }

                        if (instanceRows.find(row => row.addedByAgentEmail === agentEmail) !== undefined) {
                            break remove_agent_if_no_longer_referenced_anywhere;
                        }

                        const agentRow = agentRows.find(row => row.email === agentEmail);

                        assert(agentRow !== undefined, `There is no ${agentEmail} in the database`);

                        agentRows.splice(agentRows.indexOf(agentRow), 1);
                    }

                    return {
                        newDb,
                        "commitMessage": `Remove ${agentEmail} as ${declarationType} of ${softwareName}`
                    };
                })
            );
        },
    "createInstance":
        (params: { formData: InstanceFormData; agent: { email: string; organization: string } }) =>
        async (...args): Promise<{ instanceId: number }> => {
            const { agent, formData } = params;

            const [dispatch] = args;

            const dInstanceId = new Deferred<{ instanceId: number }>();

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { instanceRows, softwareRows } = newDb;

                    {
                        const fmtUrl = (url: string | undefined) =>
                            url === undefined ? {} : url.toLowerCase().replace(/\/$/, "");

                        assert(
                            instanceRows.find(
                                row =>
                                    row.mainSoftwareSillId === formData.mainSoftwareSillId &&
                                    fmtUrl(row.publicUrl) === fmtUrl(formData.publicUrl)
                            ) === undefined,
                            "This instance is already referenced"
                        );
                    }

                    const softwareRow = softwareRows.find(row => row.id === formData.mainSoftwareSillId);

                    assert(softwareRow !== undefined, "Can't create instance, software not in SILL");

                    const instanceId =
                        instanceRows.map(({ id }) => id).reduce((prev, curr) => Math.max(prev, curr), 0) + 1;

                    dInstanceId.resolve({ instanceId });

                    const now = Date.now();

                    instanceRows.push({
                        "id": instanceId,
                        "addedByAgentEmail": agent.email,
                        "organization": formData.organization,
                        "mainSoftwareSillId": formData.mainSoftwareSillId,
                        "otherSoftwareWikidataIds": formData.otherSoftwareWikidataIds,
                        "publicUrl": formData.publicUrl,
                        "targetAudience": formData.targetAudience,
                        "referencedSinceTime": now,
                        "updateTime": now
                    });

                    return {
                        newDb,
                        "commitMessage": `Adding ${softwareRow.name} instance: ${formData.publicUrl}`
                    };
                })
            );

            return dInstanceId.pr;
        },
    "updateInstance":
        (params: { instanceId: number; formData: InstanceFormData; agentEmail: string }) =>
        async (...args): Promise<void> => {
            const { instanceId, formData, agentEmail } = params;

            const [dispatch] = args;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { instanceRows } = newDb;

                    const index = instanceRows.findIndex(row => row.id === instanceId);

                    assert(index !== -1, "Can't update instance, it doesn't exist");

                    const {
                        mainSoftwareSillId,
                        organization,
                        otherSoftwareWikidataIds,
                        publicUrl,
                        targetAudience,
                        ...rest
                    } = formData;

                    assert<Equals<typeof rest, {}>>();

                    const { id, addedByAgentEmail, referencedSinceTime } = instanceRows[index];

                    instanceRows[index] = {
                        id,
                        addedByAgentEmail,
                        mainSoftwareSillId,
                        organization,
                        otherSoftwareWikidataIds,
                        publicUrl,
                        targetAudience,
                        referencedSinceTime,
                        "updateTime": Date.now()
                    };

                    return {
                        newDb,
                        "commitMessage": `Instance ${formData.publicUrl} updated by ${agentEmail}`
                    };
                })
            );
        },
    "changeAgentOrganization":
        (params: { userId: string; email: string; newOrganization: string }) =>
        async (...args) => {
            const [dispatch, , rootContext] = args;

            const { userApi } = rootContext;

            const { userId, email, newOrganization } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { agentRows } = newDb;

                    const agentRow = agentRows.find(row => row.email === email);

                    if (agentRow === undefined) {
                        return;
                    }

                    const { organization: oldOrganization } = agentRow;

                    agentRow.organization = newOrganization;

                    return {
                        "result": undefined,
                        newDb,
                        "commitMessage": `Update ${email} organization from ${oldOrganization} to ${newOrganization}`
                    };
                })
            );

            await userApi.updateUserOrganization({
                "organization": newOrganization,
                userId
            });
        },
    "updateUserEmail":
        (params: { userId: string; email: string; newEmail: string }) =>
        async (...args) => {
            const [dispatch, , rootContext] = args;

            const { userApi } = rootContext;

            const { userId, email, newEmail } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { agentRows, softwareReferentRows, softwareUserRows, softwareRows } = newDb;

                    const agent = agentRows.find(row => row.email === email);

                    if (agent === undefined) {
                        return;
                    }

                    agent.email = newEmail;

                    softwareReferentRows
                        .filter(({ agentEmail }) => agentEmail === email)
                        .forEach(softwareReferentRow => (softwareReferentRow.agentEmail = newEmail));

                    softwareUserRows
                        .filter(({ agentEmail }) => agentEmail === email)
                        .forEach(softwareUserRow => (softwareUserRow.agentEmail = newEmail));

                    softwareRows.filter(({ addedByAgentEmail }) => addedByAgentEmail === newEmail);

                    return {
                        "commitMessage": `Updating referent email from ${email} to ${newEmail}`,
                        newDb
                    };
                })
            );

            await userApi.updateUserEmail({
                "email": newEmail,
                userId
            });
        },
    "getAgentIsPublic":
        (params: { email: string }) =>
        (...args): boolean => {
            const [, getState] = args;

            const { email } = params;

            const { isPublic = false } = selectors.aboutAndIsPublicByAgentEmail(getState())[email] ?? {};

            return isPublic;
        },
    "getAgent":
        (params: { email: string }) =>
        async (...args): Promise<Agent & { isPublic: boolean; about: string | undefined }> => {
            const [, getState] = args;

            const { email } = params;

            const state = getState();

            const { agent } = (() => {
                const agents = selectors.agents(state);

                const agent = agents.find(agent => agent.email === email);

                return { agent };
            })();

            const { isPublic = false, about } = selectors.aboutAndIsPublicByAgentEmail(state)[email] ?? {};

            return {
                "email": email,
                "organization": agent?.organization ?? "",
                "declarations": agent?.declarations ?? [],
                isPublic,
                about
            };
        },
    "updateIsAgentProfilePublic":
        (params: { agent: { email: string; organization: string }; isPublic: boolean }) =>
        async (...args) => {
            const [dispatch] = args;

            const {
                agent: { email, organization },
                isPublic
            } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { agentRows } = newDb;

                    let agentRow = agentRows.find(agentRow => agentRow.email === email);

                    if (agentRow === undefined) {
                        agentRow = {
                            email,
                            organization,
                            "isPublic": false,
                            "about": undefined
                        };

                        agentRows.push(agentRow);
                    }

                    agentRow.isPublic = isPublic;

                    return {
                        newDb,
                        "commitMessage": `Making ${email} profile ${isPublic ? "public" : "private"}`
                    };
                })
            );
        },
    "updateAgentAbout":
        (params: { agent: { email: string; organization: string }; about: string | undefined }) =>
        async (...args) => {
            const [dispatch] = args;

            const {
                agent: { email, organization },
                about
            } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { agentRows } = newDb;

                    let agentRow = agentRows.find(agentRow => agentRow.email === email);

                    if (agentRow === undefined) {
                        agentRow = {
                            email,
                            organization,
                            "isPublic": false,
                            "about": undefined
                        };

                        agentRows.push(agentRow);
                    }

                    agentRow.about = about;

                    return {
                        newDb,
                        "commitMessage": `Updating ${email} about markdown text`
                    };
                })
            );
        },
    "unreferenceSoftware":
        (params: { softwareName: string; reason: string }) =>
        async (...args): Promise<void> => {
            const [dispatch] = args;

            const { softwareName, reason } = params;

            await dispatch(
                privateThunks.transaction(async newDb => {
                    const { softwareRows } = newDb;

                    const softwareRow = softwareRows.find(softwareRow => softwareRow.name === softwareName);

                    assert(softwareRow !== undefined, `There is no ${softwareName} in the database`);

                    softwareRow.dereferencing = {
                        "time": Date.now(),
                        reason,
                        "lastRecommendedVersion": softwareRow.versionMin
                    };

                    return {
                        newDb,
                        "commitMessage": `Dereferencing ${softwareName} because ${reason}`
                    };
                })
            );
        }
} satisfies Thunks;

const privateThunks = {
    "transaction":
        (asyncReducer: (dbClone: Db) => Promise<{ newDb: Db; commitMessage: string } | undefined>) =>
        async (...args): Promise<void> => {
            const [dispatch, getState, rootContext] = args;

            const { compileData, dbApi } = rootContext;

            const { mutex } = getContext(rootContext);

            const dLocalStateUpdated = new Deferred<void>();

            mutex
                .runExclusive(async () => {
                    let newDb = structuredClone(getState()[name].db);

                    const reducerReturnValue = await asyncReducer(newDb);

                    if (reducerReturnValue === undefined) {
                        return;
                    }

                    const { commitMessage, newDb: newDbReturnedByReducer } = reducerReturnValue;

                    if (newDbReturnedByReducer !== undefined) {
                        newDb = newDbReturnedByReducer;
                    }

                    const state = getState()[name];

                    if (same(newDb, state.db)) {
                        return;
                    }

                    //NOTE: It's important to call compileData first as it may crash
                    //and if it does it mean that if we have committed we'll end up with
                    //inconsistent state.
                    const newCompiledData = await compileData({
                        "db": newDb,
                        "getCachedSoftware": ({ sillSoftwareId }) =>
                            state.compiledData.find(({ id }) => id === sillSoftwareId)
                    });

                    dispatch(
                        actions.updated({
                            "db": newDb,
                            "compiledData": newCompiledData
                        })
                    );

                    dLocalStateUpdated.resolve();

                    try {
                        await Promise.all([
                            dbApi.updateDb({ newDb, commitMessage }),
                            dbApi.updateCompiledData({ newCompiledData, commitMessage })
                        ]);
                    } catch (error) {
                        console.error(
                            `Error while updating the DB, this is fatal, terminating the process now`,
                            String(error)
                        );
                        process.exit(1);
                    }
                })
                .catch(error => dLocalStateUpdated.reject(error));

            await dLocalStateUpdated.pr;
        },
    "triggerNonIncrementalCompilation":
        (params: { triggerType: "periodical" | "manual" | "initial" }) =>
        async (...args) => {
            console.log("Starting non incremental compilation");

            const { triggerType } = params;

            const [dispatch, getState, rootContext] = args;

            const { dbApi, compileData } = rootContext;

            const { mutex } = getContext(rootContext);

            const dbBefore = structuredClone(getState()[name].db);

            console.log("Non incremental compilation started");

            const newCompiledData = await compileData({
                "db": dbBefore,
                "getCachedSoftware": undefined
            });

            const wasCanceled = await mutex.runExclusive(async (): Promise<boolean> => {
                const { db } = getState()[name];

                if (!same(dbBefore, db)) {
                    //While we where re compiling there was some other transaction,
                    //Re-scheduling.
                    console.log(
                        "Re-scheduling non incremental compilation, db has changed (probably due to a concurrent transaction)"
                    );
                    return true;
                }

                await dbApi.updateCompiledData({
                    newCompiledData,
                    "commitMessage": (() => {
                        switch (triggerType) {
                            case "initial":
                                return "Some data have changed while the backend was down";
                            case "periodical":
                                return "Periodical update: Some Wikidata or other 3rd party source data have changed";
                            case "manual":
                                return "Manual trigger: Some data have changed since last compilation";
                        }
                    })()
                });

                dispatch(
                    actions.updated({
                        db,
                        "compiledData": newCompiledData
                    })
                );

                return false;
            });

            if (wasCanceled) {
                console.log("Data have changed, re-scheduling non incremental compilation");
                await dispatch(privateThunks.triggerNonIncrementalCompilation(params));
            }

            console.log("Done with non incremental compilation");
        },
    /** Functions that returns logoUrlFromFormData if it's not the same as the one from the automatic suggestions */
    "getStorableLogo":
        (params: { logoUrlFromFormData: string | undefined; externalId: string | undefined }) =>
        async (...args): Promise<string | undefined> => {
            const { logoUrlFromFormData, externalId } = params;

            const [dispatch] = args;

            if (logoUrlFromFormData === undefined) {
                return undefined;
            }

            if (externalId === undefined) {
                return logoUrlFromFormData;
            }

            const softwareFormAutoFillData = await dispatch(
                suggestionAndAutoFill.thunks.getSoftwareFormAutoFillDataFromExternalAndOtherSources({
                    externalId
                })
            );

            if (softwareFormAutoFillData.softwareLogoUrl === logoUrlFromFormData) {
                return undefined;
            }

            return logoUrlFromFormData;
        }
} satisfies Thunks;
