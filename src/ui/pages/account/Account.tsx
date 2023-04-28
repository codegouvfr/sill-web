import { useEffect, useState, useMemo } from "react";
import { makeStyles } from "@codegouvfr/react-dsfr/tss";
import { fr } from "@codegouvfr/react-dsfr";
import { useTranslation } from "ui/i18n";
import { assert } from "tsafe/assert";
import { Equals } from "tsafe";
import { declareComponentKeys } from "i18nifty";
import { useCoreFunctions, useCoreState, selectors } from "core";
import { Input } from "@codegouvfr/react-dsfr/Input";
import { z } from "zod";
import { AutocompleteInputFree } from "ui/shared/AutocompleteInputFree";
import { Button } from "@codegouvfr/react-dsfr/Button";
import type { PageRoute } from "./route";
import { LoadingFallback } from "ui/shared/LoadingFallback";

type Props = {
    className?: string;
    route: PageRoute;
};

export default function Account(props: Props) {
    const { className, route, ...rest } = props;

    /** Assert to make sure all props are deconstructed */
    assert<Equals<typeof rest, {}>>();

    const { userAccountManagement } = useCoreFunctions();
    const { readyState } = useCoreState(selectors.userAccountManagement.readyState);

    useEffect(() => {
        userAccountManagement.initialize();
    }, []);

    if (readyState === undefined) {
        return <LoadingFallback />;
    }

    return <AccountReady className={className} />;
}

function AccountReady(props: { className?: string }) {
    const { className } = props;

    const { classes, cx } = useStyles();
    const { t } = useTranslation({ Account });
    const { t: tCommon } = useTranslation({ "App": null });

    const {
        allOrganizations,
        email,
        organization,
        doSupportPasswordReset,
        allowedEmailRegExp
    } = (function useClosure() {
        const { readyState } = useCoreState(selectors.userAccountManagement.readyState);

        assert(readyState !== undefined);

        const { allowedEmailRegexpStr, ...rest } = readyState;

        const allowedEmailRegExp = useMemo(
            () => new RegExp(allowedEmailRegexpStr),
            [allowedEmailRegexpStr]
        );

        return {
            ...rest,
            allowedEmailRegExp
        };
    })();

    const { userAccountManagement } = useCoreFunctions();

    const [emailInputValue, setEmailInputValue] = useState(email.value);
    /** prettier-ignore */
    const [organizationInputValue, setOrganizationInputValue] = useState(
        organization.value
    );

    const emailInputValueErrorMessage = (() => {
        try {
            z.string().email().parse(emailInputValue);
        } catch {
            return "invalid email";
        }

        if (!allowedEmailRegExp.test(emailInputValue)) {
            return "Your email domain isn't allowed yet";
        }

        return undefined;
    })();

    return (
        <div className={cx(fr.cx("fr-container"), classes.root, className)}>
            <h2 className={classes.title}>{t("title")}</h2>
            <div style={{ "position": "relative" }}>
                <div
                    style={{ "position": "absolute", "display": "flex", "width": "100%" }}
                >
                    <Input
                        style={{ "flex": 1 }}
                        label={t("mail")}
                        nativeInputProps={{
                            "onChange": event => setEmailInputValue(event.target.value),
                            "value": emailInputValue
                        }}
                        state={
                            emailInputValueErrorMessage === undefined
                                ? undefined
                                : "error"
                        }
                        stateRelatedMessage={emailInputValueErrorMessage}
                        disabled={email.isBeingUpdated}
                    />
                    <Button
                        style={{
                            "position": "relative",
                            "top": 32,
                            "marginLeft": fr.spacing("3v"),
                            "alignSelf": "flex-start",
                            "visibility":
                                email.value === emailInputValue ||
                                emailInputValueErrorMessage !== undefined
                                    ? "hidden"
                                    : undefined
                        }}
                        onClick={() =>
                            userAccountManagement.updateField({
                                "fieldName": "email",
                                "value": emailInputValue
                            })
                        }
                        disabled={emailInputValueErrorMessage !== undefined}
                    >
                        {t("update")}
                    </Button>
                </div>
                <div style={{ "height": 125 }} />
            </div>
            <div>
                <AutocompleteInputFree
                    className={"fr-input-group"}
                    options={allOrganizations}
                    value={organization.value}
                    onValueChange={value => setOrganizationInputValue(value ?? "")}
                    getOptionLabel={entry => entry}
                    renderOption={(liProps, entry) => (
                        <li {...liProps}>
                            <span>{entry}</span>
                        </li>
                    )}
                    noOptionText={tCommon("no result")}
                    dsfrInputProps={{
                        "label": t("organization"),
                        "disabled": organization.isBeingUpdated,
                        "nativeInputProps": {
                            "onBlur": event => {
                                setOrganizationInputValue(event.target.value);
                            }
                        }
                    }}
                />
                <Button
                    onClick={() =>
                        userAccountManagement.updateField({
                            "fieldName": "organization",
                            "value": organizationInputValue
                        })
                    }
                    disabled={organization.value === organizationInputValue}
                >
                    {tCommon("validate")}
                </Button>
            </div>
            {doSupportPasswordReset && (
                <a href={userAccountManagement.getPasswordResetUrl()}>
                    {t("change password")}
                </a>
            )}
        </div>
    );
}

const useStyles = makeStyles({
    "name": { Account }
})(_theme => ({
    "root": {
        "paddingTop": fr.spacing("6v"),
        "maxWidth": 600
    },
    "title": {
        "marginBottom": fr.spacing("10v"),
        [fr.breakpoints.down("md")]: {
            "marginBottom": fr.spacing("8v")
        }
    }
}));

export const { i18n } = declareComponentKeys<
    "title" | "mail" | "organization" | "change password" | "no organization" | "update"
>()({ Account });
