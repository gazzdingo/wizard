/* eslint-disable max-lines */

import {
  askForAIConsent,
  askForGrowthbookApiKey,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
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
import { addEditorRulesStep, runPrettierStep } from '../steps';

export async function runReactWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'GrowthBook React Wizard',
  });

  const aiConsent = await askForAIConsent(options);

  if (!aiConsent) {
    clack.log.error(
      'The React wizard requires AI to get setup right now. Please view the docs to setup React manually instead: https://docs.growthbook.io/lib/react',
    );
    clack.outro('Setup cancelled');
    return;
  }

  const usingCloud = await isUsingCloud();

  const growthbookApiKey = await askForGrowthbookApiKey();

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'react', 'React');

  const reactVersion = getPackageVersion('react', packageJson);

  if (reactVersion) {
    analytics.setTag('react-version', reactVersion);
  }

  const sdkAlreadyInstalled = hasPackageInstalled(
    '@growthbook/growthbook-react',
    packageJson,
  );

  analytics.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const { packageManager: packageManagerFromInstallStep } =
    await installPackage({
      packageName: '@growthbook/growthbook-react',
      packageNameDisplayLabel: '@growthbook/growthbook-react',
      alreadyInstalled:
        !!packageJson?.dependencies?.['@growthbook/growthbook-react'],
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

  clack.log.info(`Reviewing GrowthBook documentation for React`);

  const filesToChange = await getFilesToChange({
    integration: Integration.react,
    relevantFiles,
    documentation: installationDocumentation,
    wizardHash: growthbookApiKey,
    usingCloud,
  });

  await generateFileChangesForIntegration({
    integration: Integration.react,
    filesToChange,
    wizardHash: growthbookApiKey,
    installDir: options.installDir,
    documentation: installationDocumentation,
    usingCloud,
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
    addedEditorRules: addedEditorRules,
    packageManager: packageManagerForOutro,
    envFileChanged: undefined,
  });

  clack.outro(outroMessage);

  await analytics.shutdown('success');
}
