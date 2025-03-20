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
import type { CloudRegion, WizardOptions } from '../utils/types';
import { traceStep } from '../telemetry';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import {
  getNextJsRouter,
  getNextJsRouterName,
  getNextJsVersionBucket,
  NextJsRouter,
} from './utils';
import {
  filterFilesPromptTemplate,
  generateFileChangesPromptTemplate,
} from './prompts';
import { query } from '../utils/query';
import clack from '../utils/clack';
import fg from 'fast-glob';
import path from 'path';
import { Integration, ISSUES_URL } from '../lib/constants';
import { getNextjsAppRouterDocs, getNextjsPagesRouterDocs } from './docs';
import { analytics } from '../utils/analytics';

export async function runNextjsWizard(options: WizardOptions): Promise<void> {
  const { forceInstall } = options;

  printWelcome({
    wizardName: 'PostHog Next.js Wizard',
  });

  const aiConsent = await askForAIConsent();

  if (!aiConsent) {
    await abort(
      'The Next.js wizard requires AI to get setup right now. Please view the docs to setup Next.js manually instead: https://posthog.com/docs/libraries/next-js',
      0,
    );
  }

  const cloudRegion = options.cloudRegion ?? (await askForCloudRegion());

  const typeScriptDetected = isUsingTypeScript(options);

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson(options);

  await ensurePackageIsInstalled(packageJson, 'next', 'Next.js');

  const nextVersion = getPackageVersion('next', packageJson);

  analytics.setTag('nextjs-version', getNextJsVersionBucket(nextVersion));

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
      forceInstall,
      askBeforeUpdating: false,
      installDir: options.installDir,
      integration: Integration.nextjs,
    });

  await installPackage({
    packageName: 'posthog-node',
    packageNameDisplayLabel: 'posthog-node',
    packageManager: packageManagerFromInstallStep,
    alreadyInstalled: !!packageJson?.dependencies?.['posthog-node'],
    forceInstall,
    askBeforeUpdating: false,
    installDir: options.installDir,
    integration: Integration.nextjs,
  });

  const router = await getNextJsRouter(options);

  const relevantFiles = await getRelevantFilesForNextJs(options);

  analytics.capture('wizard interaction', {
    action: 'detected relevant files',
    integration: Integration.nextjs,
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
    cloudRegion,
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
        cloudRegion,
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
    projectApiKey,
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
${chalk.green('Successfully installed PostHog!')} ${`\n\n${
    aiConsent
      ? `Note: This uses experimental AI to setup your project. It might have got it wrong, pleaes check!\n`
      : ``
  }You should validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
    `${packageManagerForOutro.runScriptCommand} dev`,
  )})`}

${chalk.dim(`If you encounter any issues, let us know here: ${ISSUES_URL}`)}`);

  await analytics.shutdown('success');
}

async function askForAIConsent() {
  return await traceStep('ask-for-ai-consent', async () => {
    const aiConsent = await abortIfCancelled(
      clack.select({
        message: 'Use AI to setup PostHog automatically? ✨',
        options: [
          {
            label: 'Yes',
            value: true,
            hint: 'We will use AI to help you setup PostHog quickly',
          },
          {
            label: 'No',
            value: false,
            hint: 'Continue without AI assistance',
          },
        ],
        initialValue: true,
      }),
    );

    return aiConsent;
  });
}

async function askForCloudRegion(): Promise<CloudRegion> {
  return await traceStep('ask-for-cloud-region', async () => {
    const cloudRegion: CloudRegion = await abortIfCancelled(
      clack.select({
        message: 'Select your cloud region',
        options: [
          {
            label: 'US 🇺🇸',
            value: 'us',
          },
          {
            label: 'EU 🇪🇺',
            value: 'eu',
          },
        ],
      }),
    );

    return cloudRegion;
  });
}

async function getRelevantFilesForNextJs({
  installDir,
}: Pick<WizardOptions, 'installDir'>) {
  const filterPatterns = ['**/*.{tsx,ts,jsx,js,mjs,cjs}'];
  const ignorePatterns = [
    'node_modules',
    'dist',
    'build',
    'public',
    'static',
    'next-env.d.*',
  ];

  const filteredFiles = await fg(filterPatterns, {
    cwd: installDir,
    ignore: ignorePatterns,
  });

  return filteredFiles;
}

export async function detectNextJs(
  options: Pick<WizardOptions, 'installDir'>,
): Promise<Integration.nextjs | undefined> {
  const packageJson = await getPackageDotJson(options);

  const hasNextInstalled = hasPackageInstalled('next', packageJson);

  if (hasNextInstalled) return Integration.nextjs;

  return undefined;
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
  cloudRegion,
}: {
  relevantFiles: string[];
  installationDocumentation: string;
  wizardHash: string;
  cloudRegion: CloudRegion;
}) {
  const filterFilesSpinner = clack.spinner();

  filterFilesSpinner.start('Selecting files to change...');

  const filterFilesResponseSchmea = z.object({
    files: z.array(z.string()),
  });

  const filterFilesPrompt = await filterFilesPromptTemplate.format({
    documentation: installationDocumentation,
    file_list: relevantFiles.join('\n'),
  });

  const filterFilesResponse = await query({
    message: filterFilesPrompt,
    schema: filterFilesResponseSchmea,
    wizardHash,
    region: cloudRegion,
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
  cloudRegion,
}: {
  filePath: string;
  content: string | undefined;
  changedFiles: FileChange[];
  unchangedFiles: string[];
  installationDocumentation: string;
  wizardHash: string;
  cloudRegion: CloudRegion;
}) {
  const generateFileChangesPrompt =
    await generateFileChangesPromptTemplate.format({
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
    region: cloudRegion,
  });

  return response.newContent;
}

async function updateFile(
  change: FileChange,
  { installDir }: Pick<WizardOptions, 'installDir'>,
) {
  const dir = path.dirname(path.join(installDir, change.filePath));
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(installDir, change.filePath),
    change.newContent,
  );
}

type FileChange = {
  filePath: string;
  oldContent?: string;
  newContent: string;
};

export async function addOrUpdateEnvironmentVariables({
  projectApiKey,
  installDir,
}: {
  projectApiKey: string;
  installDir: string;
}): Promise<void> {
  const envVarContent = `# Posthog\nNEXT_PUBLIC_POSTHOG_KEY=${projectApiKey}`;

  const dotEnvLocalFilePath = path.join(installDir, '.env.local');
  const dotEnvFilePath = path.join(installDir, '.env');
  const targetEnvFilePath = fs.existsSync(dotEnvLocalFilePath)
    ? dotEnvLocalFilePath
    : dotEnvFilePath;

  const dotEnvFileExists = fs.existsSync(targetEnvFilePath);

  const relativeEnvFilePath = path.relative(installDir, targetEnvFilePath);

  if (dotEnvFileExists) {
    const dotEnvFileContent = fs.readFileSync(targetEnvFilePath, 'utf8');

    const hasProjectApiKey = dotEnvFileContent.includes(
      `NEXT_PUBLIC_POSTHOG_KEY=${projectApiKey}`,
    );
    if (hasProjectApiKey) {
      clack.log.success(
        `${chalk.bold.cyan(
          relativeEnvFilePath,
        )} already has the necessary environment variables.`,
      );
    } else {
      try {
        let newContent = dotEnvFileContent;

        if (dotEnvFileContent.match(/^NEXT_PUBLIC_POSTHOG_KEY=.*$/m)) {
          newContent = dotEnvFileContent.replace(
            /^NEXT_PUBLIC_POSTHOG_KEY=.*$/m,
            `NEXT_PUBLIC_POSTHOG_KEY=${projectApiKey}`,
          );
        } else {
          if (!dotEnvFileContent.endsWith('\n')) {
            newContent += '\n';
          }
          newContent += envVarContent;
        }

        await fs.promises.writeFile(targetEnvFilePath, newContent, {
          encoding: 'utf8',
          flag: 'w',
        });
        clack.log.success(
          `Updated environment variables in ${chalk.bold.cyan(
            relativeEnvFilePath,
          )}`,
        );
      } catch (error) {
        clack.log.warning(
          `Failed to update environment variables in ${chalk.bold.cyan(
            relativeEnvFilePath,
          )}. Please update them manually. Error: ${error.message}`,
        );
      }
    }
  } else {
    try {
      await fs.promises.writeFile(targetEnvFilePath, envVarContent, {
        encoding: 'utf8',
        flag: 'w',
      });
      clack.log.success(
        `Created ${chalk.bold.cyan(
          relativeEnvFilePath,
        )} with environment variables for PostHog.`,
      );
    } catch (error) {
      clack.log.warning(
        `Failed to create ${chalk.bold.cyan(
          relativeEnvFilePath,
        )} with environment variables for PostHog. Please add them manually. Error: ${
          error.message
        }`,
      );
    }
  }

  const gitignorePath = getDotGitignore({ installDir });

  if (gitignorePath) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const envFiles = ['.env', '.env.local'];
    const missingEnvFiles = envFiles;

    if (missingEnvFiles.length > 0) {
      try {
        const newGitignoreContent = `${gitignoreContent}\n${missingEnvFiles.join(
          '\n',
        )}`;
        await fs.promises.writeFile(gitignorePath, newGitignoreContent, {
          encoding: 'utf8',
          flag: 'w',
        });
        clack.log.success(
          `Updated ${chalk.bold.cyan(
            '.gitignore',
          )} to include environment files.`,
        );
      } catch (error) {
        clack.log.warning(
          `Failed to update ${chalk.bold.cyan(
            '.gitignore',
          )} to include environment files. Error: ${error.message}`,
        );
      }
    }
  } else {
    try {
      const newGitignoreContent = `.env\n.env.local\n`;
      await fs.promises.writeFile(
        path.join(installDir, '.gitignore'),
        newGitignoreContent,
        {
          encoding: 'utf8',
          flag: 'w',
        },
      );
      clack.log.success(
        `Created ${chalk.bold.cyan('.gitignore')} with environment files.`,
      );
    } catch (error) {
      clack.log.warning(
        `Failed to create ${chalk.bold.cyan(
          '.gitignore',
        )} with environment files. Error: ${error.message}`,
      );
    }
  }
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
