import React, { useEffect, useState } from "react";
import { createGroup } from "type-route";
import type { Route } from "type-route";
import { routes } from "ui-dsfr/routes";
import { selectors, useCoreState, useCoreFunctions } from "core-dsfr";
import { Breadcrumb } from "@codegouvfr/react-dsfr/Breadcrumb";
import { makeStyles } from "tss-react/dsfr";
import { fr } from "@codegouvfr/react-dsfr";
import { declareComponentKeys } from "i18nifty";
import { useTranslation } from "../../../i18n";
import { FooterSoftwareUserAndReferent } from "./FooterSoftwareUserAndReferent";

SoftwareUserAndReferent.routeGroup = createGroup([routes.softwareDetails]);

type PageRoute = Route<typeof SoftwareUserAndReferent.routeGroup>;

SoftwareUserAndReferent.getDoRequireUserLoggedIn = () => false;

export type Props = {
    className?: string;
    route: Pick<PageRoute, "params">;
};

export function SoftwareUserAndReferent(props: Props) {
    const { className, route } = props;

    const { softwareDetails } = useCoreFunctions();

    useEffect(() => {
        softwareDetails.setSoftware({
            "softwareName": route.params.name
        });

        return () =>
            softwareDetails.setSoftware({
                "softwareName": undefined
            });
    }, [route.params.name]);

    const { classes, cx } = useStyles();

    const { t } = useTranslation({ SoftwareUserAndReferent });
    const { software } = useCoreState(selectors.softwareDetails.software);

    const [activeMenu, setActiveMenu] = useState(0);

    const MenuTabs = [
        {
            "id": 0,
            "label": `${t("tab user title")} (${software?.userCount})`
        },
        {
            "id": 1,
            "label": `${t("tab referent title")} (${software?.referentCount})`
        }
    ];

    const onChangeTabMenu = (id: number) => {
        setActiveMenu(id);
    };

    //TODO: Refacto when user and referent will be available in software data
    const contentItems = activeMenu === 0 ? software?.authors : [];

    return (
        <div>
            <Breadcrumb
                segments={[
                    {
                        linkProps: {
                            href: "#"
                        },
                        label: t("catalog breadcrumb")
                    },
                    {
                        linkProps: {
                            href: "#"
                        },
                        label: software?.softwareName
                    }
                ]}
                currentPageLabel={t("user and referent breadcrumb")}
                className={classes.breadcrumb}
            />
            <div className={classes.header}>
                <a href={"/"} className={classes.backButton}>
                    <i className={fr.cx("fr-icon-arrow-left-s-line")} />
                </a>
                <h4 className={classes.title}>{t("title")}</h4>
            </div>
            <div className={classes.main}>
                <nav
                    className={cx(fr.cx("fr-sidemenu"), classes.sidemenu)}
                    aria-labelledby="fr-sidemenu-title"
                >
                    <div className={fr.cx("fr-sidemenu__inner")}>
                        <button
                            className={fr.cx("fr-sidemenu__btn")}
                            hidden
                            aria-controls="fr-sidemenu-wrapper"
                            aria-expanded="false"
                        >
                            {t("category")} (
                            {activeMenu === 0
                                ? t("tab user title")
                                : t("tab referent title")}
                            )
                        </button>
                        <div className={fr.cx("fr-collapse")} id="fr-sidemenu-wrapper">
                            <div
                                className={cx(
                                    fr.cx("fr-sidemenu__title"),
                                    classes.sidemenuTitle
                                )}
                                id="fr-sidemenu-title"
                            >
                                <img
                                    src={software?.logoUrl}
                                    alt=""
                                    className={classes.logo}
                                />
                                {software?.softwareName}
                            </div>
                            <ul className={fr.cx("fr-sidemenu__list")}>
                                {MenuTabs.map(tab => {
                                    const ariaCurrent =
                                        tab.id === activeMenu
                                            ? {
                                                  "aria-current": "step"
                                              }
                                            : {};

                                    return (
                                        <li
                                            className={cx(fr.cx("fr-sidemenu__item"), {
                                                "fr-sidemenu__item--active":
                                                    tab.id === activeMenu
                                            })}
                                        >
                                            {/*@ts-ignore*/}
                                            <a
                                                className={fr.cx("fr-sidemenu__link")}
                                                href="#"
                                                target="_self"
                                                {...ariaCurrent}
                                                onClick={() => onChangeTabMenu(tab.id)}
                                            >
                                                {tab.label}
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
                </nav>
                <div className={classes.contentMenuTab}>
                    <ul>
                        {contentItems?.map(author => {
                            return (
                                <li key={author.authorName}>
                                    <a href={author.authorUrl}>{author.authorName}</a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
            <FooterSoftwareUserAndReferent
                softwareDetails=""
                declareUserOrReferent={{
                    href: "",
                    onClick: () => {}
                }}
                activeMenu={activeMenu}
            />
        </div>
    );
}

const useStyles = makeStyles({
    "name": { SoftwareUserAndReferent }
})(() => ({
    "breadcrumb": {
        "marginBottom": fr.spacing("4v")
    },
    "header": {
        "display": "flex",
        "alignItems": "center",
        "marginBottom": fr.spacing("10v")
    },
    "backButton": {
        "background": "none",
        "marginRight": fr.spacing("4v"),

        "&>i": {
            "&::before": {
                "--icon-size": fr.spacing("8v")
            }
        }
    },
    "title": {
        "marginBottom": 0
    },
    "main": {
        "display": "flex",
        [fr.breakpoints.down("md")]: {
            "flexDirection": "column"
        }
    },
    "sidemenu": {
        "flex": 1
    },
    "sidemenuTitle": {
        "display": "flex",
        "alignItems": "center"
    },
    "logo": {
        "width": "50px",
        "height": "50px",
        "marginRight": fr.spacing("2v")
    },
    "contentMenuTab": {
        "flex": 2
    }
}));

export const { i18n } = declareComponentKeys<
    | "catalog breadcrumb"
    | "user and referent breadcrumb"
    | "title"
    | "tab user title"
    | "tab referent title"
    | "category"
>()({ SoftwareUserAndReferent });