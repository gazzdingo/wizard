/* eslint-disable max-lines */

import {
  abort,
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
import { getReactDocumentation } from './docs';
import { analytics } from '../utils/analytics';
import { detectEnvVarPrefix } from '../utils/environment';
import {
  generateFileChangesForIntegration,
  getFilesToChange,
  getRelevantFilesForIntegration,
} from '../utils/file-utils';
import type { WizardOptions } from '../utils/types';
import { isUsingCloud } from '../utils/clack-utils';
import { getOutroMessage } from '../lib/messages';
import {
  addEditorRulesStep,
  addOrUpdateEnvironmentVariablesStep,
  runPrettierStep,
} from '../steps';

export async function runReactWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'PostHog React Wizard',
  });

  const aiConsent = await askForAIConsent(options);

  if (!aiConsent) {
    await abort(
      'The React wizard requires AI to get setup right now. Please view the docs to setup React manually instead: https://posthog.com/docs/libraries/react',
      0,
    );
  }

  const usingCloud = await isUsingCloud();
  const host = usingCloud ? 'https://app.growthbook.io' : await askForSelfHostedUrl();

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'react', 'React');

  const reactVersion = getPackageVersion('react', packageJson);

  if (reactVersion) {
    analytics.setTag('react-version', reactVersion);
  }

  const { projectApiKey, wizardHash } = await getOrAskForProjectData({
    ...options,
    usingCloud,
    host,
  });

  const sdkAlreadyInstalled = hasPackageInstalled('posthog-js', packageJson);

  analytics.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const { packageManager: packageManagerFromInstallStep } =
    await installPackage({
      packageName: 'posthog-js',
      packageNameDisplayLabel: 'posthog-js',
      alreadyInstalled: !!packageJson?.dependencies?.['posthog-js'],
      forceInstall: options.forceInstall,
      askBeforeUpdating: false,
      installDir: options.installDir,
      integration: Integration.react,
    });

  const relevantFiles = await getRelevantFilesForIntegration({
    installDir: options.installDir,
    integration: Integration.react,
  });

  const envVarPrefix = await detectEnvVarPrefix(options);

  const installationDocumentation = getReactDocumentation({
    language: typeScriptDetected ? 'typescript' : 'javascript',
    envVarPrefix,
  });

  clack.log.info(`Reviewing PostHog documentation for React`);

  const filesToChange = await getFilesToChange({
    integration: Integration.react,
    relevantFiles,
    documentation: installationDocumentation,
    wizardHash,
    usingCloud,
  });

  await generateFileChangesForIntegration({
    integration: Integration.react,
    filesToChange,
    wizardHash,
    installDir: options.installDir,
    documentation: installationDocumentation,
    usingCloud,
  });

  const { relativeEnvFilePath, addedEnvVariables } =
    await addOrUpdateEnvironmentVariablesStep({
      variables: {
        [envVarPrefix + 'POSTHOG_KEY']: projectApiKey,
        [envVarPrefix + 'POSTHOG_HOST']: host,
      },
      installDir: options.installDir,
      integration: Integration.react,
    });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager(options));

  await runPrettierStep({
    installDir: options.installDir,
    integration: Integration.react,
  });

  const addedEditorRules = await addEditorRulesStep({
    installDir: options.installDir,
    rulesName: 'react-rules.md',
    integration: Integration.react,
    default: options.default,
  });

  const outroMessage = getOutroMessage({
    options,
    integration: Integration.react,
    usingCloud,
    addedEditorRules,
    packageManager: packageManagerForOutro,
    envFileChanged: addedEnvVariables ? relativeEnvFilePath : undefined,
  });

  clack.outro(outroMessage);

  await analytics.shutdown('success');
}
