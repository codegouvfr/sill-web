import { bootstrapCore } from "../src/core";
import { env } from "../src/env";

(async () => {
    const { core } = await bootstrapCore({
        "keycloakUserApiParams": undefined,
        "dbConfig": {
            "dbKind": "git",
            "dataRepoSshUrl": "git@github.com:codegouvfr/sill-data.git",
            "sshPrivateKey": env.sshPrivateKeyForGit,
            "sshPrivateKeyName": env.sshPrivateKeyForGitName
        },
        "githubPersonalAccessTokenForApiRateLimit": env.githubPersonalAccessTokenForApiRateLimit,
        "doPerPerformPeriodicalCompilation": false,
        "doPerformCacheInitialization": false,
        "externalSoftwareDataOrigin": env.externalSoftwareDataOrigin
    });

    await core.functions.readWriteSillData.manuallyTriggerNonIncrementalCompilation();

    process.exit(0);
})();
