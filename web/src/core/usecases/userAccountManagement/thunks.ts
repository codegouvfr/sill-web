import { assert } from "tsafe/assert";
import type { Thunks } from "core/bootstrap";
import { addParamToUrl } from "powerhooks/tools/urlSearchParams";
import { name, actions } from "./state";

export const thunks = {
    "initialize":
        () =>
        async (...args) => {
            const [dispatch, getState, { oidc, getUser, sillApi }] = args;

            {
                const state = getState()[name];

                if (state.stateDescription === "ready" || state.isInitializing) {
                    return;
                }
            }

            dispatch(actions.initializeStarted());

            assert(oidc.isUserLoggedIn);

            const user = await getUser();

            const [
                { keycloakParams },
                allowedEmailRegexpStr,
                allOrganizations,
                {
                    agent: { about = "", isPublic }
                }
            ] = await Promise.all([
                sillApi.getOidcParams(),
                sillApi.getAllowedEmailRegexp(),
                sillApi.getAllOrganizations(),
                sillApi.getAgent({ "email": user.email })
            ]);

            dispatch(
                actions.initialized({
                    allowedEmailRegexpStr,
                    "email": user.email,
                    "organization": user.organization,
                    "passwordResetUrlWithoutLangParam":
                        keycloakParams === undefined
                            ? undefined
                            : addParamToUrl({
                                  "url": [
                                      keycloakParams.url.replace(/\/$/, ""),
                                      "realms",
                                      keycloakParams.realm,
                                      "account",
                                      "password"
                                  ].join("/"),
                                  "name": "referrer",
                                  "value": keycloakParams.clientId
                              }).newUrl,
                    allOrganizations,
                    about,
                    isPublic
                })
            );
        },
    "updateField":
        (
            params:
                | {
                      fieldName: "organization" | "email";
                      value: string;
                  }
                | {
                      fieldName: "aboutAndIsPublic";
                      about: string;
                      isPublic: boolean;
                  }
        ) =>
        async (...args) => {
            const [dispatch, getState, { sillApi, oidc }] = args;

            const state = getState()[name];

            dispatch(actions.updateFieldStarted(params));

            assert(state.stateDescription === "ready");

            assert(oidc.isUserLoggedIn);

            switch (params.fieldName) {
                case "organization":
                    await sillApi.changeAgentOrganization({
                        "newOrganization": params.value
                    });
                    await oidc.renewTokens();
                    break;
                case "email":
                    await sillApi.updateEmail({ "newEmail": params.value });
                    await oidc.renewTokens();
                    break;
                case "aboutAndIsPublic":
                    await Promise.all([
                        (async () => {
                            if (state.aboutAndIsPublic.about === params.about) {
                                return;
                            }

                            await sillApi.updateAgentAbout({
                                "about": params.about || undefined
                            });
                        })(),
                        (async () => {
                            if (state.aboutAndIsPublic.isPublic === params.isPublic) {
                                return;
                            }

                            await sillApi.updateIsAgentProfilePublic({
                                "isPublic": params.isPublic
                            });
                        })()
                    ]);

                    break;
            }

            dispatch(actions.updateFieldCompleted({ "fieldName": params.fieldName }));
        },
    "getPasswordResetUrl":
        () =>
        (...args): string => {
            const [
                ,
                getState,
                {
                    paramsOfBootstrapCore: { getCurrentLang }
                }
            ] = args;

            const state = getState()[name];

            assert(state.stateDescription === "ready");

            assert(state.passwordResetUrlWithoutLangParam !== undefined);

            let url = state.passwordResetUrlWithoutLangParam;

            {
                const { newUrl } = addParamToUrl({
                    url,
                    "name": "referrer_uri",
                    "value": window.location.href
                });

                url = newUrl;
            }

            {
                const { newUrl } = addParamToUrl({
                    url,
                    "name": "kc_locale",
                    "value": getCurrentLang()
                });

                url = newUrl;
            }

            return url;
        }
} satisfies Thunks;
