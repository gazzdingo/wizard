/* eslint-disable max-lines */

import chalk from 'chalk';
import * as fs from 'fs';
import { z } from 'zod';
import {
  abort,
  abortIfCancelled,
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
import type { WizardOptions } from '../utils/types';
import { traceStep } from '../telemetry';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import {
  getNextJsRouter,
  getNextJsRouterName,
  getNextJsVersionBucket,
  NextJsRouter,
} from './utils';
import { query } from '../utils/query';
import clack from '../utils/clack';
import fg from 'fast-glob';
import path from 'path';
import { Integration, ISSUES_URL } from '../lib/constants';
import { analytics } from '../utils/analytics';
import { getFilterFilesPromptTemplate, getGenerateFileChangesPromptTemplate } from './prompts';
import { addOrUpdateEnvironmentVariables } from '../utils/environment';
export async function runNextjsWizard(options: WizardOptions): Promise<void> {
  const { forceInstall } = options;

  printWelcome({
    wizardName: 'PostHog React Wizard',
  });

  const aiConsent = await askForAIConsent();

  if (!aiConsent) {
    await abort(
      'The React wizard requires AI to get setup right now. Please view the docs to setup Next.js manually instead: https://posthog.com/docs/libraries/react',
      0,
    );
  }

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'react', 'React');

  const reactVersion = getPackageVersion('react', packageJson);

  analytics.setTag('react-version', getNextJsVersionBucket(reactVersion));

  const { projectApiKey, wizardHash, host } = await getOrAskForProjectData(
    options,
  );

  const sdkAlreadyInstalled = hasPackageInstalled('posthog-js', packageJson);

  analytics.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const { packageManager: packageManagerFromInstallStep } =
    await installPackage({
      packageName: 'posthog-js',
      packageNameDisplayLabel: 'posthog-js',
      alreadyInstalled: !!packageJson?.dependencies?.['posthog-js'],
      forceInstall,
      askBeforeUpdating: false,
      installDir: options.installDir,
      integration: Integration.react,
    });

  const router = await getNextJsRouter(options);

  const relevantFiles = await getRelevantFilesForNextJs(options);

  analytics.capture('wizard interaction', {
    action: 'detected relevant files',
    integration: Integration.react,
    number_of_files: relevantFiles.length,
  });

  const installationDocumentation = getInstallationDocumentation({
    router,
    host,
    language: typeScriptDetected ? 'typescript' : 'javascript',
  });

  clack.log.info(
    `Reviewing PostHog documentation for ${getNextJsRouterName(router)}`,
  );

  const filesToChange = await getFilesToChange({
    relevantFiles,
    installationDocumentation,
    wizardHash,
  });

  analytics.capture('wizard interaction', {
    action: 'detected files to change',
    integration: Integration.nextjs,
    files: filesToChange,
  });

  const changes: FileChange[] = [];

  for (const filePath of filesToChange) {
    const fileChangeSpinner = clack.spinner();

    analytics.capture('wizard interaction', {
      action: 'processing file',
      integration: Integration.nextjs,
      file: filePath,
    });

    try {
      let oldContent = undefined;
      try {
        oldContent = await fs.promises.readFile(
          path.join(options.installDir, filePath),
          'utf8',
        );
      } catch (readError) {
        if (readError.code !== 'ENOENT') {
          await abort(`Error reading file ${filePath}`);
          continue;
        }
      }

      fileChangeSpinner.start(
        `${oldContent ? 'Updating' : 'Creating'} file ${filePath}`,
      );

      const unchangedFiles = filesToChange.filter(
        (filePath) => !changes.some((change) => change.filePath === filePath),
      );

      const newContent = await generateFileChanges({
        filePath,
        content: oldContent,
        changedFiles: changes,
        unchangedFiles,
        installationDocumentation,
        wizardHash,
      });

      if (newContent !== oldContent) {
        await updateFile({ filePath, oldContent, newContent }, options);
        changes.push({ filePath, oldContent, newContent });
      }

      fileChangeSpinner.stop(
        `${oldContent ? 'Updated' : 'Created'} file ${filePath}`,
      );

      analytics.capture('wizard interaction', {
        action: 'processed file',
        integration: Integration.nextjs,
        file: filePath,
      });
    } catch (error) {
      await abort(`Error processing file ${filePath}`);
    }
  }

  await addOrUpdateEnvironmentVariables({
    variables: {
      REACT_APP_PUBLIC_POSTHOG_KEY: projectApiKey,
    },
    installDir: options.installDir,
  });

  analytics.capture('wizard interaction', {
    action: 'added environment variables',
    integration: Integration.nextjs,
  });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager(options));

  await runPrettierIfInstalled({
    installDir: options.installDir,
    integration: Integration.nextjs,
  });

  clack.outro(`
${chalk.green('Successfully installed PostHog!')} ${`\n\n${aiConsent
      ? `Note: This uses experimental AI to setup your project. It might have got it wrong, pleaes check!\n`
      : ``
    }You should validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
      `${packageManagerForOutro.runScriptCommand} dev`,
    )})`}

${chalk.dim(`If you encounter any issues, let us know here: ${ISSUES_URL}`)}`);

  await analytics.shutdown('success');
}

function getInstallationDocumentation({
  router,
  host,
  language,
}: {
  router: NextJsRouter;
  host: string;
  language: 'typescript' | 'javascript';
}) {
  if (router === NextJsRouter.PAGES_ROUTER) {
    return getNextjsPagesRouterDocs({ host, language });
  }

  return getNextjsAppRouterDocs({ host, language });
}

async function getFilesToChange({
  relevantFiles,
  installationDocumentation,
  wizardHash,
}: {
  relevantFiles: string[];
  installationDocumentation: string;
  wizardHash: string;
}) {
  const filterFilesSpinner = clack.spinner();

  filterFilesSpinner.start('Selecting files to change...');

  const filterFilesResponseSchmea = z.object({
    files: z.array(z.string()),
  });

  const filterFilesPrompt = await (await getFilterFilesPromptTemplate()).format({
    documentation: installationDocumentation,
    file_list: relevantFiles.join('\n'),
  });

  const filterFilesResponse = await query({
    message: filterFilesPrompt,
    schema: filterFilesResponseSchmea,
    wizardHash,
  });

  const filesToChange = filterFilesResponse.files;

  filterFilesSpinner.stop(`Found ${filesToChange.length} files to change`);

  return filesToChange;
}

async function generateFileChanges({
  filePath,
  content,
  changedFiles,
  unchangedFiles,
  installationDocumentation,
  wizardHash,
}: {
  filePath: string;
  content: string | undefined;
  changedFiles: FileChange[];
  unchangedFiles: string[];
  installationDocumentation: string;
  wizardHash: string;
}) {
  const generateFileChangesPrompt =
    await (await getGenerateFileChangesPromptTemplate()).format({
      file_path: filePath,
      file_content: content,
      changed_files: changedFiles
        .map((change) => `${change.filePath}\n${change.oldContent}`)
        .join('\n'),
      unchanged_files: unchangedFiles,
      documentation: installationDocumentation,
    });

  const response = await query({
    message: generateFileChangesPrompt,
    schema: z.object({
      newContent: z.string(),
    }),
    wizardHash: wizardHash,
  });

  return response.newContent;
}



export function getDotGitignore({
  installDir,
}: Pick<WizardOptions, 'installDir'>) {
  const gitignorePath = path.join(installDir, '.gitignore');
  const gitignoreExists = fs.existsSync(gitignorePath);

  if (gitignoreExists) {
    return gitignorePath;
  }

  return undefined;
}
