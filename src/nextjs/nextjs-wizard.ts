/* eslint-disable max-lines */

import chalk from 'chalk';
import * as fs from 'fs';
// @ts-ignore - magicast is ESM and TS complains about that. It works though
import * as path from 'path';
import { z } from 'zod';
import {
  abort,
  abortIfCancelled,
  addDotEnvSentryBuildPluginFile,
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
import { getNextJsRouter, getNextJsVersionBucket, NextJsRouter } from './utils';
import * as Sentry from '@sentry/node';
import { INSTALL_DIR, Integration, ISSUES_URL } from '../../lib/Constants';
import { getAllFilesInProject } from '../utils/file-utils';
import { NEXTJS_APP_ROUTER_DOCS, NEXTJS_PAGES_ROUTER_DOCS } from './docs';
import { filterFilesPromptTemplate, generateFileChangesPromptTemplate } from './prompts';
import { llm } from '../utils/openai';
import clack from '../utils/clack';

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
    alreadyInstalled: !!packageJson?.dependencies?.['posthog-node'],
    forceInstall,
    askBeforeUpdating: false,
  });

  const allFiles = await getAllFilesInProject(INSTALL_DIR);

  const router = await getNextJsRouter(allFiles);

  const relevantFiles = await getRelevantFilesForNextJs();

  const installationDocumentation = getInstallationDocumentation({ router });

  const filesToChange = await getFilesToChange({ relevantFiles, installationDocumentation });

  const changes: { filePath: string, oldContent: string, newContent: string }[] = [];

  for (const file of filesToChange) {
    const oldContent = await fs.promises.readFile(file, 'utf8');
    const newContent = await generateFileChanges({ filePath: file, content: oldContent, changes, installationDocumentation });

    if (newContent !== oldContent) {
      await updateFile({ filePath: file, oldContent, newContent });
      changes.push({ filePath: file, oldContent, newContent });
    }
  }

  clack.log.info(`Made ${changes.length} changes.`);


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
  const allFiles = await getAllFilesInProject(INSTALL_DIR);

  const filterPatterns = ["*.tsx", "*.ts", "*.jsx", "*.js"];
  const ignorePatterns = ["node_modules", "dist", "build", "public", "static", "next-env.d.ts", "next-env.d.tsx"];

  const filteredFiles = allFiles.filter((file) => {
    return filterPatterns.some((pattern) => file.match(pattern)) && !ignorePatterns.some((pattern) => file.match(pattern));
  })

  clack.log.info(`Found ${filteredFiles.length} relevant files.`);

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

  const filterFilesPrompt = await filterFilesPromptTemplate.format({
    documentation: installationDocumentation,
    file_list: relevantFiles.join('\n'),
  });

  const filterFilesResponseSchmea = z.object({
    files: z.array(z.string()),
  });

  const structuredLlm = llm.withStructuredOutput(filterFilesResponseSchmea);

  const filterFilesResponse = await structuredLlm.invoke(filterFilesPrompt);

  return filterFilesResponse.files;
}

async function generateFileChanges({ filePath, content, changes, installationDocumentation }: { filePath: string, content: string | undefined, changes: FileChange[], installationDocumentation: string }) {

  const fileChangeSpinner = clack.spinner();

  fileChangeSpinner.start(`Generating changes for ${filePath}`);

  const generateFileChangesPrompt = await generateFileChangesPromptTemplate.format({
    file_path: filePath,
    file_content: content,
    changes: changes.map((change) => `${change.filePath}\n${change.oldContent}`).join('\n'),
    documentation: installationDocumentation,
  });

  const structuredLlm = llm.withStructuredOutput(z.object({
    newContent: z.string(),
  }));

  const response = await structuredLlm.invoke(generateFileChangesPrompt);

  fileChangeSpinner.stop();

  return response.newContent;
}

async function updateFile(change: FileChange) {
  await fs.promises.writeFile(change.filePath, change.newContent);
  clack.log.info(`Updated ${change.filePath}`);
}

type FileChange = {
  filePath: string;
  oldContent: string;
  newContent: string;
}