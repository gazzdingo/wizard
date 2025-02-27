/* eslint-disable max-lines */

import chalk from 'chalk';
import * as fs from 'fs';
import { z } from 'zod';
import {
  abort,
  abortIfCancelled,
  confirmContinueIfNoOrDirtyGitRepo,
  getOrAskForProjectData,
  getPackageDotJson,
  getPackageManager,
  installPackage,
  isUsingTypeScript,
  printWelcome,
  runPrettierIfInstalled
} from '../utils/clack-utils';
import type { WizardOptions } from '../utils/types';
import { traceStep, withTelemetry } from '../telemetry';
import { getPackageVersion, hasPackageInstalled } from '../utils/package-json';
import { getNextJsRouter, getNextJsRouterName, getNextJsVersionBucket, NextJsRouter } from './utils';
import * as Sentry from '@sentry/node';
import { NEXTJS_APP_ROUTER_DOCS, NEXTJS_PAGES_ROUTER_DOCS } from './docs';
import { filterFilesPromptTemplate, generateFileChangesPromptTemplate } from './prompts';
import { query } from '../utils/query';
import clack from '../utils/clack';
import fg from 'fast-glob';
import path from 'path';
import { INSTALL_DIR, Integration, ISSUES_URL } from '../../lib/Constants';

export function runNextjsWizard(options: WizardOptions) {
  return withTelemetry(
    {
      enabled: options.telemetryEnabled,
      integration: 'nextjs',
      wizardOptions: options,
    },
    () => runNextjsWizardWithTelemetry(options),
  );
}

export async function runNextjsWizardWithTelemetry(
  options: WizardOptions,
): Promise<void> {
  const { telemetryEnabled, forceInstall } = options;

  printWelcome({
    wizardName: 'PostHog Next.js Wizard',
    telemetryEnabled,
  });

  const aiConsent = await askForAIConsent();

  if (!aiConsent) {
    await abort('The Next.js wizard requires AI to get setup right now. Please view the docs to setup Next.js manually instead: https://posthog.com/docs/libraries/next-js', 0);
  }

  const typeScriptDetected = isUsingTypeScript();

  await confirmContinueIfNoOrDirtyGitRepo();

  const packageJson = await getPackageDotJson();

  const nextVersion = getPackageVersion('next', packageJson);

  Sentry.setTag('nextjs-version', getNextJsVersionBucket(nextVersion));

  const { projectApiKey } =
    await getOrAskForProjectData(options, Integration.nextjs);

  const sdkAlreadyInstalled = hasPackageInstalled('posthog-js', packageJson);

  Sentry.setTag('sdk-already-installed', sdkAlreadyInstalled);

  const { packageManager: packageManagerFromInstallStep } =
    await installPackage({
      packageName: 'posthog-js',
      packageNameDisplayLabel: 'posthog-js',
      alreadyInstalled: !!packageJson?.dependencies?.['posthog-js'],
      forceInstall,
      askBeforeUpdating: false,
    });


  await installPackage({
    packageName: 'posthog-node',
    packageNameDisplayLabel: 'posthog-node',
    packageManager: packageManagerFromInstallStep,
    alreadyInstalled: !!packageJson?.dependencies?.['posthog-node'],
    forceInstall,
    askBeforeUpdating: false,
  });

  const router = await getNextJsRouter();

  const relevantFiles = await getRelevantFilesForNextJs();

  const installationDocumentation = getInstallationDocumentation({ router });

  clack.log.info(`Reviewing PostHog documentation for ${getNextJsRouterName(router)}`);

  const filesToChange = await getFilesToChange({ relevantFiles, installationDocumentation });

  const changes: FileChange[] = [];

  for (const filePath of filesToChange) {

    const fileChangeSpinner = clack.spinner();

    try {
      let oldContent = undefined;
      try {
        oldContent = await fs.promises.readFile(path.join(INSTALL_DIR, filePath), 'utf8');
      } catch (readError) {
        if (readError.code !== 'ENOENT') {
          await abort(`Error reading file ${filePath}`);
          continue;
        }
      }

      fileChangeSpinner.start(`${oldContent ? 'Updating' : 'Creating'} file ${filePath}`);

      const unchangedFiles = filesToChange.filter((filePath) => !changes.some((change) => change.filePath === filePath));

      const newContent = await generateFileChanges({ filePath, content: oldContent, changedFiles: changes, unchangedFiles, installationDocumentation });

      if (newContent !== oldContent) {
        await updateFile({ filePath, oldContent, newContent });
        changes.push({ filePath, oldContent, newContent });
      }

      fileChangeSpinner.stop(`${oldContent ? 'Updated' : 'Created'} file ${filePath}`);
    } catch (error) {
      await abort(`Error processing file ${filePath}`);
    }
  }

  await addEnvironmentVariables({
    projectApiKey,
    host: "https://us.i.posthog.com",
  });

  const packageManagerForOutro =
    packageManagerFromInstallStep ?? (await getPackageManager());

  await runPrettierIfInstalled();

  clack.outro(`
${chalk.green('Successfully installed PostHog!')} ${`\n\nYou can validate your setup by (re)starting your dev environment (e.g. ${chalk.cyan(
    `${packageManagerForOutro.runScriptCommand} dev`
  )})`
    }

${chalk.dim(
      `If you encounter any issues, let us know here: ${ISSUES_URL}`,
    )}`);
}

async function askForAIConsent() {
  return await traceStep('ask-for-ai-consent', async () => {
    const aiConsent = await abortIfCancelled(
      clack.select({
        message:
          'Use AI to setup PostHog automatically? ✨',
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


async function getRelevantFilesForNextJs() {

  const filterPatterns = ["**/*.{tsx,ts,jsx,js}"];
  const ignorePatterns = ["node_modules", "dist", "build", "public", "static", "next-env.d.*"];

  const filteredFiles = await fg(filterPatterns, { cwd: INSTALL_DIR, ignore: ignorePatterns });

  return filteredFiles;
}

export async function detectNextJs(): Promise<Integration.nextjs | undefined> {
  const packageJson = await getPackageDotJson();

  const hasNextInstalled = hasPackageInstalled('next', packageJson);

  if (hasNextInstalled) return Integration.nextjs;

  return undefined;
}

function getInstallationDocumentation({ router }: { router: NextJsRouter }) {
  if (router === NextJsRouter.PAGES_ROUTER) {
    return NEXTJS_PAGES_ROUTER_DOCS
  }

  return NEXTJS_APP_ROUTER_DOCS;
}

async function getFilesToChange({ relevantFiles, installationDocumentation }: { relevantFiles: string[], installationDocumentation: string }) {

  const filterFilesSpinner = clack.spinner();

  filterFilesSpinner.start('Selecting files to change...');

  const filterFilesResponseSchmea = z.object({
    files: z.array(z.string()),
  });

  const filterFilesPrompt = await filterFilesPromptTemplate.format({
    documentation: installationDocumentation,
    file_list: relevantFiles.join('\n'),
  });

  const filterFilesResponse = await query({ message: filterFilesPrompt, schema: filterFilesResponseSchmea });

  const filesToChange = filterFilesResponse.files;

  filterFilesSpinner.stop(`Found ${filesToChange.length} files to change`);

  return filesToChange;
}

async function generateFileChanges({ filePath, content, changedFiles, unchangedFiles, installationDocumentation }: { filePath: string, content: string | undefined, changedFiles: FileChange[], unchangedFiles: string[], installationDocumentation: string }) {

  const generateFileChangesPrompt = await generateFileChangesPromptTemplate.format({
    file_path: filePath,
    file_content: content,
    changed_files: changedFiles.map((change) => `${change.filePath}\n${change.oldContent}`).join('\n'),
    unchanged_files: unchangedFiles,
    documentation: installationDocumentation,
  });

  const response = await query({
    message: generateFileChangesPrompt, schema: z.object({
      newContent: z.string(),
    })
  });

  return response.newContent;
}

async function updateFile(change: FileChange) {
  const dir = path.dirname(path.join(INSTALL_DIR, change.filePath));
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(INSTALL_DIR, change.filePath), change.newContent);
}

type FileChange = {
  filePath: string;
  oldContent?: string;
  newContent: string;
}


export async function addEnvironmentVariables({
  projectApiKey,
  host,
}: {
  projectApiKey: string;
  host: string;
}): Promise<void> {
  const envVarContent = `# Posthog
NEXT_PUBLIC_POSTHOG_KEY=${projectApiKey}
NEXT_PUBLIC_POSTHOG_HOST=${host}
`;

  const dotEnvLocalFilePath = path.join(INSTALL_DIR, '.env.local');
  const dotEnvFilePath = path.join(INSTALL_DIR, '.env');
  const targetEnvFilePath = fs.existsSync(dotEnvLocalFilePath) ? dotEnvLocalFilePath : dotEnvFilePath;

  const dotEnvFileExists = fs.existsSync(targetEnvFilePath);

  const relativeEnvFilePath = path.relative(INSTALL_DIR, targetEnvFilePath);

  if (dotEnvFileExists) {
    const dotEnvFileContent = fs.readFileSync(targetEnvFilePath, 'utf8');

    const hasProjectApiKey = !!dotEnvFileContent.match(/^\s*NEXT_PUBLIC_POSTHOG_KEY\s*=/m);
    const hasHost = !!dotEnvFileContent.match(/^\s*NEXT_PUBLIC_POSTHOG_HOST\s*=/m);

    if (hasProjectApiKey && hasHost) {
      clack.log.warn(`${chalk.bold.cyan(relativeEnvFilePath)} already has the necessary environment variables. Will not add them.`);
    } else {
      try {
        const newContent = `${dotEnvFileContent}
${envVarContent}`;
        await fs.promises.writeFile(targetEnvFilePath, newContent, {
          encoding: 'utf8',
          flag: 'w',
        });
        clack.log.success(`Added environment variables to ${chalk.bold.cyan(relativeEnvFilePath)}`);
      } catch {
        clack.log.warning(`Failed to add environment variables to ${chalk.bold.cyan(relativeEnvFilePath)}. Please add them manually.`);
      }
    }
  } else {
    try {
      await fs.promises.writeFile(targetEnvFilePath, envVarContent, {
        encoding: 'utf8',
        flag: 'w',
      });
      clack.log.success(`Created ${chalk.bold.cyan(relativeEnvFilePath)} with environment variables for PostHog.`);
    } catch {
      clack.log.warning(`Failed to create ${chalk.bold.cyan(relativeEnvFilePath)} with environment variables for PostHog. Please add them manually.`);
    }
  }

  const gitignorePath = getDotGitignore();

  if (gitignorePath) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const envFiles = ['.env', '.env.local'];
    const missingEnvFiles = envFiles.filter(file => !gitignoreContent.includes(file));

    if (missingEnvFiles.length > 0) {
      try {
        const newGitignoreContent = `${gitignoreContent}
${missingEnvFiles.join('\n')}`;
        await fs.promises.writeFile(gitignorePath, newGitignoreContent, {
          encoding: 'utf8',
          flag: 'w',
        });
        clack.log.success(`Updated ${chalk.bold.cyan('.gitignore')} to include environment files.`);
      } catch {
        clack.log.warning(`Failed to update ${chalk.bold.cyan('.gitignore')} to include environment files.`);
      }
    }
  } else {
    try {
      const newGitignoreContent = `.env\n.env.local\n`;
      await fs.promises.writeFile(path.join(INSTALL_DIR, '.gitignore'), newGitignoreContent, {
        encoding: 'utf8',
        flag: 'w',
      });
      clack.log.success(`Created ${chalk.bold.cyan('.gitignore')} with environment files.`);
    } catch {
      clack.log.warning(`Failed to create ${chalk.bold.cyan('.gitignore')} with environment files.`);
    }
  }
}

export function getDotGitignore() {
  const gitignorePath = path.join(INSTALL_DIR, '.gitignore');
  const gitignoreExists = fs.existsSync(gitignorePath);

  if (gitignoreExists) {
    return gitignorePath;
  }

  return undefined;
}