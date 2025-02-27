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
import { INSTALL_DIR, Integration, ISSUES_URL } from '../../lib/Constants';
import { NEXTJS_APP_ROUTER_DOCS, NEXTJS_PAGES_ROUTER_DOCS } from './docs';
import { filterFilesPromptTemplate, generateFileChangesPromptTemplate } from './prompts';
import { getOpenAi } from '../utils/openai';
import clack from '../utils/clack';
import fg from 'fast-glob';
import path from 'path';

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

  clack.log.info(`Reviewing PostHog documentation for ${getNextJsRouterName(router)}...`);

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

      const newContent = await generateFileChanges({ filePath, content: oldContent, changes, installationDocumentation });

      if (newContent !== oldContent) {
        await updateFile({ filePath, oldContent, newContent });
        changes.push({ filePath, oldContent, newContent });
        clack.log.info(`Updated file: ${filePath}`);
      } else {
        clack.log.info(`No changes needed for file: ${filePath}`);
      }

      fileChangeSpinner.stop();
    } catch (error) {
      await abort(`Error processing file ${filePath}`);
    }
  }


  // TODO: Add environment variables.

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
  const ignorePatterns = ["node_modules", "dist", "build", "public", "static", "next-env.d.ts", "next-env.d.tsx"];

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

  const llm = getOpenAi();


  const structuredLlm = llm.withStructuredOutput(filterFilesResponseSchmea, { method: "json_schema" });


  const filterFilesResponse = await structuredLlm.invoke(filterFilesPrompt);

  const filesToChange = filterFilesResponse.files;

  filterFilesSpinner.stop(`Found ${filesToChange.length} files to change.`);

  return filesToChange;
}

async function generateFileChanges({ filePath, content, changes, installationDocumentation }: { filePath: string, content: string | undefined, changes: FileChange[], installationDocumentation: string }) {

  const generateFileChangesPrompt = await generateFileChangesPromptTemplate.format({
    file_path: filePath,
    file_content: content,
    changes: changes.map((change) => `${change.filePath}\n${change.oldContent}`).join('\n'),
    documentation: installationDocumentation,
  });

  const llm = getOpenAi();

  const structuredLlm = llm.withStructuredOutput(z.object({
    newContent: z.string(),
  }));

  const response = await structuredLlm.invoke(generateFileChangesPrompt);

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