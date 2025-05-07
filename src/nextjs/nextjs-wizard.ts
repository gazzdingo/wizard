/* eslint-disable max-lines */
import {
  askForAIConsent,
  askForSelfHostedUrl,
  chooseSdkConnection,
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
import {
  getNextJsRouter,
  getNextJsRouterName,
  getNextJsVersionBucket,
  NextJsRouter,
} from './utils';
import clack from '../utils/clack';
import { Integration } from '../lib/constants';
import { getNextjsAppRouterDocs, getNextjsPagesRouterDocs } from './docs';
import { analytics } from '../utils/analytics';
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
  createPRStep,
  runPrettierStep,
} from '../steps';
import { getAttributes, getSdkConnections } from '../utils/query';
export async function runNextjsWizard(options: WizardOptions): Promise<void> {
  printWelcome({
    wizardName: 'GrowthBook Next.js Wizard',
  });

  const aiConsent = await askForAIConsent(options);

  if (!aiConsent) {
    clack.log.error(
      'The Next.js wizard requires AI to get setup right now. Please view the docs to setup Next.js manually instead: https://docs.growthbook.io/lib/react',
    );
    clack.outro('Setup cancelled');
    return;
  }

  const usingCloud = await isUsingCloud();

  const {host, apiHost} = usingCloud
    ? {host: 'https://app.growthbook.io', apiHost: 'https://api.growthbook.io'}
    : await askForSelfHostedUrl();

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo(options);

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'next', 'Next.js');

  const nextVersion = getPackageVersion('next', packageJson);

  analytics.setTag('nextjs-version', getNextJsVersionBucket(nextVersion));

  const growthbookApiKey = await getOrAskForProjectData({
    ...options,
    usingCloud,
    host,
    apiHost,
  });
  if (!growthbookApiKey) {
    clack.log.error('login failed');
    clack.outro('Setup cancelled');
    return;
  }
  const sdkConnections = await getSdkConnections(growthbookApiKey, apiHost);
  const sdkConnection = await chooseSdkConnection(sdkConnections);
  const attributes = await getAttributes(growthbookApiKey, apiHost);
  if (!growthbookApiKey) {
    clack.log.error('No GrowthBook API key provided');
    clack.outro('Setup cancelled');
    return;
  }

  const sdkAlreadyInstalled = hasPackageInstalled(
    '@growthbook/growthbook',
    packageJson,
  );

  analytics.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const { packageManager: packageManagerFromInstallStep } =
    await installPackage({
      packageName: '@growthbook/growthbook',
      packageNameDisplayLabel: '@growthbook/growthbook',
      alreadyInstalled: !!packageJson?.dependencies?.['@growthbook/growthbook'],
      forceInstall: options.forceInstall,
      askBeforeUpdating: false,
      installDir: options.installDir,
      integration: Integration.nextjs,
    });
  const router = await getNextJsRouter(options);
  const relevantFiles = await getRelevantFilesForIntegration({
    installDir: options.installDir,
    integration: Integration.nextjs,
  });
  const installationDocumentation = getInstallationDocumentation({
    router,
    language: typeScriptDetected ? 'typescript' : 'javascript',
    sdkConnection,
    attributes,
    host,
  });

  clack.log.info(
    `Reviewing GrowthBook documentation for ${getNextJsRouterName(router)}`,
  );

  const filesToChange = await getFilesToChange({
    integration: Integration.nextjs,
    relevantFiles,
    documentation: installationDocumentation,
    wizardHash: growthbookApiKey,
    usingCloud,
  });

  await generateFileChangesForIntegration({
    integration: Integration.nextjs,
    filesToChange,
    wizardHash: growthbookApiKey,
    installDir: options.installDir,
    documentation: installationDocumentation,
    usingCloud,
  });

  const { relativeEnvFilePath, addedEnvVariables } =
    await addOrUpdateEnvironmentVariablesStep({
      variables: {
        NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY: growthbookApiKey,
        NEXT_PUBLIC_GROWTHBOOK_API_HOST: host,
      },
      installDir: options.installDir,
      integration: Integration.nextjs,
    });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager(options));

  await runPrettierStep({
    installDir: options.installDir,
    integration: Integration.nextjs,
  });

  const addedEditorRules = await addEditorRulesStep({
    rulesName: 'next-rules.md',
    installDir: options.installDir,
    integration: Integration.nextjs,
    default: options.default,
  });

  const prUrl = await createPRStep({
    installDir: options.installDir,
    integration: Integration.nextjs,
    addedEditorRules,
  });

  const outroMessage = getOutroMessage({
    options,
    integration: Integration.nextjs,
    usingCloud,
    addedEditorRules,
    packageManager: packageManagerForOutro,
    envFileChanged: addedEnvVariables ? relativeEnvFilePath : undefined,
    prUrl,
  });

  clack.outro(outroMessage);

  analytics.shutdown('success');
}

function getInstallationDocumentation({
  router,
  language,
  sdkConnection,
  attributes,
  host,
}: {
  router: NextJsRouter;
  language: 'typescript' | 'javascript';
  sdkConnection: string;
  attributes: any[];
  host: string;
}) {
  if (router === NextJsRouter.PAGES_ROUTER) {
    return getNextjsPagesRouterDocs({
      language,
      sdkConnection,
      attributes,
      host,
    });
  }

  return getNextjsAppRouterDocs({ language, sdkConnection, attributes, host });
}
