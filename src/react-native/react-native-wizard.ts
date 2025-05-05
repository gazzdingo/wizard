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
import { getReactNativeDocumentation } from './docs';
import { analytics } from '../utils/analytics';
import {
  generateFileChangesForIntegration,
  getFilesToChange,
  getRelevantFilesForIntegration,
} from '../utils/file-utils';
import type { WizardOptions } from '../utils/types';
import { isUsingCloud } from '../utils/clack-utils';
import { addEditorRulesStep, runPrettierStep } from '../steps';
import { EXPO } from '../utils/package-manager';
import { getOutroMessage } from '../lib/messages';

export async function runReactNativeWizard(
  options: WizardOptions,
): Promise<void> {
  printWelcome({
    wizardName: 'PostHog React Native Wizard',
  });

  const aiConsent = await askForAIConsent(options);

  if (!aiConsent) {
    await abort(
      'The React Native wizard requires AI to get setup right now. Please view the docs to setup React Native manually instead: https://posthog.com/docs/libraries/react-native',
      0,
    );
  }

  const usingCloud = await isUsingCloud();
  const host = usingCloud ? 'https://app.growthbook.io' : await askForSelfHostedUrl();

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'react-native', 'React Native');

  const reactNativeVersion = getPackageVersion('react-native', packageJson);

  if (reactNativeVersion) {
    analytics.setTag('react-native-version', reactNativeVersion);
  }

  const { projectApiKey, wizardHash } = await getOrAskForProjectData({
    ...options,
    usingCloud,
    host
  });

  const sdkAlreadyInstalled = hasPackageInstalled('posthog-js', packageJson);

  analytics.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const isUsingExpo = hasPackageInstalled('expo', packageJson);

  if (isUsingExpo) {
    analytics.setTag('is-using-expo', true);
    analytics.setTag('expo-version', getPackageVersion('expo', packageJson));
  }

  clack.log.info(`Detected ${isUsingExpo ? 'Expo' : 'React Native'}`);

  const packagesToInstall = isUsingExpo
    ? [
        'posthog-react-native',
        'posthog-react-native-session-replay',
        'expo-file-system',
        'expo-application',
        'expo-device',
        'expo-localization',
      ]
    : [
        'posthog-react-native',
        '@react-native-async-storage/async-storage',
        'react-native-device-info',
        'react-native-localize',
      ];

  for (const packageName of packagesToInstall) {
    await installPackage({
      packageName,
      packageNameDisplayLabel: packageName,
      alreadyInstalled: !!packageJson?.dependencies?.[packageName],
      forceInstall: options.forceInstall,
      askBeforeUpdating: false,
      installDir: options.installDir,
      integration: Integration.reactNative,
      packageManager: isUsingExpo ? EXPO : undefined,
    });
  }

  const relevantFiles = await getRelevantFilesForIntegration({
    installDir: options.installDir,
    integration: Integration.reactNative,
  });

  const installationDocumentation = getReactNativeDocumentation({
    language: typeScriptDetected ? 'typescript' : 'javascript',
    host,
    projectApiKey,
  });

  clack.log.info(
    `Reviewing PostHog documentation for ${
      isUsingExpo ? 'Expo' : 'React Native'
    }`,
  );

  const filesToChange = await getFilesToChange({
    integration: Integration.reactNative,
    relevantFiles,
    documentation: installationDocumentation,
    wizardHash,
    usingCloud,
  });

  await generateFileChangesForIntegration({
    integration: Integration.reactNative,
    filesToChange,
    wizardHash,
    installDir: options.installDir,
    documentation: installationDocumentation,
    usingCloud,
  });

  await runPrettierStep({
    installDir: options.installDir,
    integration: Integration.reactNative,
  });

  const addedEditorRules = await addEditorRulesStep({
    installDir: options.installDir,
    rulesName: 'react-native-rules.md',
    integration: Integration.reactNative,
    default: options.default,
  });

  const packageManagerForOutro = await getPackageManager({
    installDir: options.installDir,
  });

  const outroMessage = getOutroMessage({
    options,
    integration: Integration.reactNative,
    usingCloud,
    addedEditorRules,
    packageManager: packageManagerForOutro,
  });

  clack.outro(outroMessage);

  await analytics.shutdown('success');
}
