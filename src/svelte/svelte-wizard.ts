/* eslint-disable max-lines */

import {
  askForAIConsent,
  askForSelfHostedUrl,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  isUsingTypeScript,
  printWelcome,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import clack from '../utils/clack';
import { Integration } from '../lib/constants';
import { getSvelteDocumentation } from './docs';
import { analytics } from '../utils/analytics';
import {
  generateFileChangesForIntegration,
  getFilesToChange,
  getRelevantFilesForIntegration,
} from '../utils/file-utils';
import type { WizardOptions } from '../utils/types';
import { isUsingCloud } from '../utils/clack-utils';
import { addEditorRulesStep } from '../steps/add-editor-rules';
import { getOutroMessage } from '../lib/messages';
import { addOrUpdateEnvironmentVariablesStep, runPrettierStep } from '../steps';

export async function runSvelteWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'GrowthBook Svelte Wizard',
  });

  const aiConsent = await askForAIConsent(options);

  if (!aiConsent) {
    clack.log.error(
      'The Svelte wizard requires AI to get setup right now. Please view the docs to setup Svelte manually instead: https://docs.growthbook.io/lib/svelte',
    );
    clack.outro('Setup cancelled');
    return;
  }

  const usingCloud = await isUsingCloud();

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, '@sveltejs/kit', '@sveltejs/kit');

  const svelteVersion = getPackageVersion('@sveltejs/kit', packageJson);

  if (svelteVersion) {
    analytics.setTag('svelte-version', svelteVersion);
  }
  const { host, apiHost } = usingCloud
    ? {
        host: 'https://app.growthbook.io',
        apiHost: 'https://api.growthbook.io',
      }
    : await askForSelfHostedUrl();
  const { token, orgId } = await getOrAskForProjectData({
    ...options,
    usingCloud,
    host,
    apiHost,
  });
  if (!token) {
    clack.log.error('login failed');
    clack.outro('Setup cancelled');
    return;
  }
  const sdkAlreadyInstalled = hasPackageInstalled(
    '@growthbook/growthbook-svelte',
    packageJson,
  );

  analytics.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const { packageManager: packageManagerFromInstallStep } =
    await installPackage({
      packageName: '@growthbook/growthbook-svelte',
      packageNameDisplayLabel: '@growthbook/growthbook-svelte',
      alreadyInstalled:
        !!packageJson?.dependencies?.['@growthbook/growthbook-svelte'],
      forceInstall: options.forceInstall,
      askBeforeUpdating: false,
      installDir: options.installDir,
      integration: Integration.svelte,
    });

  await installPackage({
    packageName: 'posthog-node',
    packageNameDisplayLabel: 'posthog-node',
    packageManager: packageManagerFromInstallStep,
    alreadyInstalled: !!packageJson?.dependencies?.['posthog-node'],
    forceInstall: options.forceInstall,
    askBeforeUpdating: false,
    installDir: options.installDir,
    integration: Integration.svelte,
  });

  const relevantFiles = await getRelevantFilesForIntegration({
    installDir: options.installDir,
    integration: Integration.svelte,
  });

  const installationDocumentation = getSvelteDocumentation({
    language: typeScriptDetected ? 'typescript' : 'javascript',
  });

  clack.log.info(`Reviewing GrowthBook documentation for Svelte`);

  const filesToChange = await getFilesToChange({
    integration: Integration.svelte,
    relevantFiles,
    documentation: installationDocumentation,
    wizardHash: token,
    usingCloud,
  });

  await generateFileChangesForIntegration({
    integration: Integration.svelte,
    filesToChange,
    wizardHash: token,
    installDir: options.installDir,
    documentation: installationDocumentation,
    usingCloud,
  });

  const { relativeEnvFilePath, addedEnvVariables } =
    await addOrUpdateEnvironmentVariablesStep({
      variables: {
        PUBLIC_GROWTHBOOK_CLIENT_KEY: token,
        PUBLIC_GROWTHBOOK_API_HOST: host,
      },
      installDir: options.installDir,
      integration: Integration.svelte,
    });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager(options));

  await runPrettierStep({
    installDir: options.installDir,
    integration: Integration.svelte,
  });

  const addedEditorRules = await addEditorRulesStep({
    installDir: options.installDir,
    rulesName: 'svelte-rules.md',
    integration: Integration.svelte,
    default: options.default,
  });

  const outroMessage = getOutroMessage({
    options,
    integration: Integration.svelte,
    usingCloud,
    addedEditorRules,
    packageManager: packageManagerForOutro,
    envFileChanged: addedEnvVariables ? relativeEnvFilePath : undefined,
  });

  clack.outro(outroMessage);

  analytics.shutdown('success');
}
