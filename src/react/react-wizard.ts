/* eslint-disable max-lines */

import chalk from 'chalk';
import {
  abort,
  askForAIConsent,
  confirmContinueIfNoOrDirtyGitRepo,
  ensurePackageIsInstalled,
  getOrAskForProjectData,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  runPrettierIfInstalled,
} from '../utils/clack-utils';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import clack from '../utils/clack';
import { Integration, ISSUES_URL } from '../lib/constants';
import { getReactDocumentation } from './docs';
import { analytics } from '../utils/analytics';
import {
  addOrUpdateEnvironmentVariables,
  detectEnvVarPrefix,
} from '../utils/environment';
import {
  generateFileChangesForIntegration,
  getFilesToChange,
  getRelevantFilesForIntegration,
} from '../utils/file-utils';
import type { WizardOptions } from '../utils/types';
import { askForCloudRegion } from '../utils/clack-utils';
import { addEditorRules } from '../utils/rules/add-editor-rules';

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

  const cloudRegion = options.cloudRegion ?? (await askForCloudRegion());

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'react', 'React');

  const reactVersion = getPackageVersion('react', packageJson);

  if (reactVersion) {
    analytics.setTag('react-version', reactVersion);
  }

  const { projectApiKey, wizardHash, host } = await getOrAskForProjectData({
    ...options,
    cloudRegion,
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
    cloudRegion,
  });

  await generateFileChangesForIntegration({
    integration: Integration.react,
    filesToChange,
    wizardHash,
    installDir: options.installDir,
    documentation: installationDocumentation,
    cloudRegion,
  });

  await addOrUpdateEnvironmentVariables({
    variables: {
      [envVarPrefix + 'POSTHOG_KEY']: projectApiKey,
      [envVarPrefix + 'POSTHOG_HOST']: host,
    },
    installDir: options.installDir,
    integration: Integration.react,
  });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager(options));

  await runPrettierIfInstalled({
    installDir: options.installDir,
    integration: Integration.react,
  });

  const addedEditorRules = await addEditorRules({
    installDir: options.installDir,
    rulesName: 'react-rules.md',
    integration: Integration.react,
    default: options.default,
  });

  clack.outro(`
${chalk.green('Successfully installed PostHog!')} ${`\n\n${
    aiConsent
      ? `Note: This uses experimental AI to setup your project. It might have got it wrong, please check!\n`
      : ``
  }
${chalk.cyan('Changes made:')}
• Installed posthog-js package
• Added PostHogProvider to the root of the app, to initialize PostHog and enable autocapture
• Added your Project API key to your .env file
${addedEditorRules ? `• Added Cursor rules for PostHog` : ''}
  
${chalk.yellow('Next steps:')}
• Call posthog.identify() when a user signs into your app
• Upload environment variables to your production environment

You should validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
    `${packageManagerForOutro.runScriptCommand} dev`,
  )})`}

    
${chalk.blue(
  `Learn more about PostHog + React: https://posthog.com/docs/libraries/react`,
)}

${chalk.dim(`If you encounter any issues, let us know here: ${ISSUES_URL}`)}`);

  await analytics.shutdown('success');
}
