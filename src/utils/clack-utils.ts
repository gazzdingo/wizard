import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { setInterval } from 'node:timers';
import { URL } from 'node:url';
// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import axios from 'axios';
import chalk from 'chalk';
import opn from 'opn';
import { traceStep } from '../telemetry';
import { debug } from './debug';
import { type PackageDotJson, hasPackageInstalled } from './package-json';
import {
  type PackageManager,
  detectPackageManger,
  packageManagers,
} from './package-manager';
import { fulfillsVersionRange } from './semver';
import type { Feature, PostHogProjectData, WizardOptions } from './types';
import { INSTALL_DIR, ISSUES_URL } from '../../lib/Constants';

export const DOT_ENV_FILE = '.env';
export const SENTRY_CLI_RC_FILE = '.sentryclirc';
export const SENTRY_PROPERTIES_FILE = 'sentry.properties';

const CLOUD_URL = 'http://localhost:8010/';

const DUMMY_PROJECT_API_KEY = '_YOUR_POSTHOG_PROJECT_API_KEY_';

interface WizardProjectData {
  projectApiKey: string;
  project: PostHogProjectData;
  temporaryAccessToken: string;
}

export interface CliSetupConfig {
  filename: string;
  name: string;
  gitignore: boolean;

  likelyAlreadyHasAuthToken(contents: string): boolean;
  tokenContent(authToken: string): string;

  likelyAlreadyHasOrgAndProject(contents: string): boolean;
  orgAndProjContent(org: string, project: string): string;

  likelyAlreadyHasUrl?(contents: string): boolean;
  urlContent?(url: string): string;
}

export interface CliSetupConfigContent {
  authToken: string;
  org?: string;
  project?: string;
  url?: string;
}

export const rcCliSetupConfig: CliSetupConfig = {
  filename: SENTRY_CLI_RC_FILE,
  name: 'source maps',
  gitignore: true,
  likelyAlreadyHasAuthToken: function (contents: string): boolean {
    return !!(contents.includes('[auth]') && contents.match(/token=./g));
  },
  tokenContent: function (authToken: string): string {
    return `[auth]\ntoken=${authToken}`;
  },
  likelyAlreadyHasOrgAndProject: function (contents: string): boolean {
    return !!(
      contents.includes('[defaults]') &&
      contents.match(/org=./g) &&
      contents.match(/project=./g)
    );
  },
  orgAndProjContent: function (org: string, project: string): string {
    return `[defaults]\norg=${org}\nproject=${project}`;
  },
};

export const propertiesCliSetupConfig: Required<CliSetupConfig> = {
  filename: SENTRY_PROPERTIES_FILE,
  gitignore: true,
  name: 'debug files',
  likelyAlreadyHasAuthToken(contents: string): boolean {
    return !!contents.match(/auth\.token=./g);
  },
  tokenContent(authToken: string): string {
    return `auth.token=${authToken}`;
  },
  likelyAlreadyHasOrgAndProject(contents: string): boolean {
    return !!(
      contents.match(/defaults\.org=./g) &&
      contents.match(/defaults\.project=./g)
    );
  },
  orgAndProjContent(org: string, project: string): string {
    return `defaults.org=${org}\ndefaults.project=${project}`;
  },
  likelyAlreadyHasUrl(contents: string): boolean {
    return !!contents.match(/defaults\.url=./g);
  },
  urlContent(url: string): string {
    return `defaults.url=${url}`;
  },
};

export async function abort(message?: string, status?: number): Promise<never> {
  clack.outro(message ?? 'Wizard setup cancelled.');
  const sentryHub = Sentry.getCurrentHub();
  const sentryTransaction = sentryHub.getScope().getTransaction();
  sentryTransaction?.setStatus('aborted');
  sentryTransaction?.finish();
  const sentrySession = sentryHub.getScope().getSession();
  if (sentrySession) {
    sentrySession.status = status === 0 ? 'abnormal' : 'crashed';
    sentryHub.captureSession(true);
  }
  await Sentry.flush(3000);
  return process.exit(status ?? 1);
}

export async function abortIfCancelled<T>(
  input: T | Promise<T>,
): Promise<Exclude<T, symbol>> {
  if (clack.isCancel(await input)) {
    clack.cancel('Wizard setup cancelled.');
    const sentryHub = Sentry.getCurrentHub();
    const sentryTransaction = sentryHub.getScope().getTransaction();
    sentryTransaction?.setStatus('cancelled');
    sentryTransaction?.finish();
    sentryHub.captureSession(true);
    await Sentry.flush(3000);
    process.exit(0);
  } else {
    return input as Exclude<T, symbol>;
  }
}

export function printWelcome(options: {
  wizardName: string;
  message?: string;
  telemetryEnabled?: boolean;
}): void {
  const wizardVersion = process.env.npm_package_version;

  // eslint-disable-next-line no-console
  console.log('');
  clack.intro(chalk.inverse(` ${options.wizardName} `));

  let welcomeText =
    options.message ||
    `The ${options.wizardName} will help you set up PostHog for your application.\nThank you for using PostHog :)`;

  if (wizardVersion) {
    welcomeText = `${welcomeText}\n\nVersion: ${wizardVersion}`;
  }

  if (options.telemetryEnabled) {
    welcomeText = `${welcomeText}

This wizard sends telemetry data and crash reports to PostHog. This helps us improve the Wizard.
You can turn this off at any time by running ${chalk.cyanBright(
      'npx @posthog/wizard --disable-telemetry',
    )}.`;
  }

  clack.note(welcomeText);
}

export async function confirmContinueIfNoOrDirtyGitRepo(): Promise<void> {
  return traceStep('check-git-status', async () => {
    if (!isInGitRepo()) {
      const continueWithoutGit = await abortIfCancelled(
        clack.confirm({
          message:
            'You are not inside a git repository. The wizard will create and update files. Do you want to continue anyway?',
        }),
      );

      Sentry.setTag('continue-without-git', continueWithoutGit);

      if (!continueWithoutGit) {
        await abort(undefined, 0);
      }
      // return early to avoid checking for uncommitted files
      return;
    }

    const uncommittedOrUntrackedFiles = getUncommittedOrUntrackedFiles();
    if (uncommittedOrUntrackedFiles.length) {
      clack.log.warn(
        `You have uncommitted or untracked files in your repo:

${uncommittedOrUntrackedFiles.join('\n')}

The wizard will create and update files.`,
      );
      const continueWithDirtyRepo = await abortIfCancelled(
        clack.confirm({
          message: 'Do you want to continue anyway?',
        }),
      );

      Sentry.setTag('continue-with-dirty-repo', continueWithDirtyRepo);

      if (!continueWithDirtyRepo) {
        await abort(undefined, 0);
      }
    }
  });
}

export function isInGitRepo() {
  try {
    childProcess.execSync('git rev-parse --is-inside-work-tree', {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function getUncommittedOrUntrackedFiles(): string[] {
  try {
    const gitStatus = childProcess
      .execSync('git status --porcelain=v1', {
        // we only care about stdout
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .toString();

    const files = gitStatus
      .split(os.EOL)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((f) => `- ${f.split(/\s+/)[1]}`);

    return files;
  } catch {
    return [];
  }
}

export async function askToInstallSentryCLI(): Promise<boolean> {
  return await abortIfCancelled(
    clack.confirm({
      message:
        "You don't have Sentry CLI installed. Do you want to install it?",
    }),
  );
}

export async function askForItemSelection(
  items: string[],
  message: string,
): Promise<{ value: string; index: number }> {
  const selection: { value: string; index: number } | symbol =
    await abortIfCancelled(
      clack.select({
        maxItems: 12,
        message: message,
        options: items.map((item, index) => {
          return {
            value: { value: item, index: index },
            label: item,
          };
        }),
      }),
    );

  return selection;
}

export async function confirmContinueIfPackageVersionNotSupported({
  packageId,
  packageName,
  packageVersion,
  acceptableVersions,
  note,
}: {
  packageId: string;
  packageName: string;
  packageVersion: string;
  acceptableVersions: string;
  note?: string;
}): Promise<void> {
  return traceStep(`check-package-version`, async () => {
    Sentry.setTag(`${packageName.toLowerCase()}-version`, packageVersion);
    const isSupportedVersion = fulfillsVersionRange({
      acceptableVersions,
      version: packageVersion,
      canBeLatest: true,
    });

    if (isSupportedVersion) {
      Sentry.setTag(`${packageName.toLowerCase()}-supported`, true);
      return;
    }

    clack.log.warn(
      `You have an unsupported version of ${packageName} installed:

  ${packageId}@${packageVersion}`,
    );

    clack.note(
      note ??
      `Please upgrade to ${acceptableVersions} if you wish to use the PostHog Wizard.`,
    );
    const continueWithUnsupportedVersion = await abortIfCancelled(
      clack.confirm({
        message: 'Do you want to continue anyway?',
      }),
    );
    Sentry.setTag(
      `${packageName.toLowerCase()}-continue-with-unsupported-version`,
      continueWithUnsupportedVersion,
    );

    if (!continueWithUnsupportedVersion) {
      await abort(undefined, 0);
    }
  });
}

/**
 * Installs or updates a package with the user's package manager.
 *
 * IMPORTANT: This function modifies the `package.json`! Be sure to re-read
 * it if you make additional modifications to it after calling this function!
 */
export async function installPackage({
  packageName,
  alreadyInstalled,
  askBeforeUpdating = true,
  packageNameDisplayLabel,
  packageManager,
  forceInstall = false,
}: {
  /** The string that is passed to the package manager CLI as identifier to install (e.g. `@sentry/nextjs`, or `@sentry/nextjs@^8`) */
  packageName: string;
  alreadyInstalled: boolean;
  askBeforeUpdating?: boolean;
  /** Overrides what is shown in the installation logs in place of the `packageName` option. Useful if the `packageName` is ugly (e.g. `@sentry/nextjs@^8`) */
  packageNameDisplayLabel?: string;
  packageManager?: PackageManager;
  /** Add force install flag to command to skip install precondition fails */
  forceInstall?: boolean;
}): Promise<{ packageManager?: PackageManager }> {
  return traceStep('install-package', async () => {
    if (alreadyInstalled && askBeforeUpdating) {
      const shouldUpdatePackage = await abortIfCancelled(
        clack.confirm({
          message: `The ${chalk.bold.cyan(
            packageNameDisplayLabel ?? packageName,
          )} package is already installed. Do you want to update it to the latest version?`,
        }),
      );

      if (!shouldUpdatePackage) {
        return {};
      }
    }

    const sdkInstallSpinner = clack.spinner();

    const pkgManager = packageManager || (await getPackageManager());

    sdkInstallSpinner.start(
      `${alreadyInstalled ? 'Updating' : 'Installing'} ${chalk.bold.cyan(
        packageNameDisplayLabel ?? packageName,
      )} with ${chalk.bold(pkgManager.label)}.`,
    );

    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `${pkgManager.installCommand} ${packageName} ${pkgManager.flags} ${forceInstall ? pkgManager.forceInstallFlag : ''
          }`,
          { cwd: INSTALL_DIR },
          (err, stdout, stderr) => {
            if (err) {
              // Write a log file so we can better troubleshoot issues
              fs.writeFileSync(
                join(
                  process.cwd(),
                  `posthog-wizard-installation-error-${Date.now()}.log`,
                ),
                JSON.stringify({
                  stdout,
                  stderr,
                }),
                { encoding: 'utf8' },
              );

              reject(err);
            } else {
              resolve();
            }
          },
        );
      });
    } catch (e) {
      sdkInstallSpinner.stop('Installation failed.');
      clack.log.error(
        `${chalk.red(
          'Encountered the following error during installation:',
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        )}\n\n${e}\n\n${chalk.dim(
          `The wizard has created a \`posthog-wizard-installation-error-*.log\` file. If you think this issue is caused by the PostHog Wizard, create an issue on GitHub and include the log file's content:\n${ISSUES_URL}`,
        )}`,
      );
      await abort();
    }

    sdkInstallSpinner.stop(
      `${alreadyInstalled ? 'Updated' : 'Installed'} ${chalk.bold.cyan(
        packageNameDisplayLabel ?? packageName,
      )} with ${chalk.bold(pkgManager.label)}.`,
    );

    return { packageManager: pkgManager };
  });
}

export async function addSentryCliConfig(
  { authToken, org, project, url }: CliSetupConfigContent,
  setupConfig: CliSetupConfig = rcCliSetupConfig,
): Promise<void> {
  return traceStep('add-sentry-cli-config', async () => {
    const configPath = join(INSTALL_DIR, setupConfig.filename);
    const configExists = fs.existsSync(configPath);

    let configContents =
      (configExists && fs.readFileSync(configPath, 'utf8')) || '';
    configContents = addAuthTokenToSentryConfig(
      configContents,
      authToken,
      setupConfig,
    );
    configContents = addOrgAndProjectToSentryConfig(
      configContents,
      org,
      project,
      setupConfig,
    );
    configContents = addUrlToSentryConfig(configContents, url, setupConfig);

    try {
      await fs.promises.writeFile(configPath, configContents, {
        encoding: 'utf8',
        flag: 'w',
      });
      clack.log.success(
        `${configExists ? 'Saved' : 'Created'} ${chalk.cyan(
          setupConfig.filename,
        )}.`,
      );
    } catch {
      clack.log.warning(
        `Failed to add auth token to ${chalk.cyan(
          setupConfig.filename,
        )}. Uploading ${setupConfig.name
        } during build will likely not work locally.`,
      );
    }

    if (setupConfig.gitignore) {
      await addCliConfigFileToGitIgnore(setupConfig.filename);
    } else {
      clack.log.warn(
        chalk.yellow('DO NOT commit auth token to your repository!'),
      );
    }
  });
}

function addAuthTokenToSentryConfig(
  configContents: string,
  authToken: string | undefined,
  setupConfig: CliSetupConfig,
): string {
  if (!authToken) {
    return configContents;
  }

  if (setupConfig.likelyAlreadyHasAuthToken(configContents)) {
    clack.log.warn(
      `${chalk.cyan(
        setupConfig.filename,
      )} already has auth token. Will not add one.`,
    );
    return configContents;
  }

  const newContents = `${configContents}\n${setupConfig.tokenContent(
    authToken,
  )}\n`;
  clack.log.success(
    `Added auth token to ${chalk.cyan(
      setupConfig.filename,
    )} for you to test uploading ${setupConfig.name} locally.`,
  );
  return newContents;
}

function addOrgAndProjectToSentryConfig(
  configContents: string,
  org: string | undefined,
  project: string | undefined,
  setupConfig: CliSetupConfig,
): string {
  if (!org || !project) {
    return configContents;
  }

  if (setupConfig.likelyAlreadyHasOrgAndProject(configContents)) {
    clack.log.warn(
      `${chalk.cyan(
        setupConfig.filename,
      )} already has org and project. Will not add them.`,
    );
    return configContents;
  }

  const newContents = `${configContents}\n${setupConfig.orgAndProjContent(
    org,
    project,
  )}\n`;
  clack.log.success(
    `Added default org and project to ${chalk.cyan(
      setupConfig.filename,
    )} for you to test uploading ${setupConfig.name} locally.`,
  );
  return newContents;
}

function addUrlToSentryConfig(
  configContents: string,
  url: string | undefined,
  setupConfig: CliSetupConfig,
): string {
  if (!url || !setupConfig.urlContent || !setupConfig.likelyAlreadyHasUrl) {
    return configContents;
  }

  if (setupConfig.likelyAlreadyHasUrl(configContents)) {
    clack.log.warn(
      `${chalk.cyan(setupConfig.filename)} already has url. Will not add one.`,
    );
    return configContents;
  }

  const newContents = `${configContents}\n${setupConfig.urlContent(url)}\n`;
  clack.log.success(
    `Added default url to ${chalk.cyan(
      setupConfig.filename,
    )} for you to test uploading ${setupConfig.name} locally.`,
  );
  return newContents;
}

export async function addDotEnvSentryBuildPluginFile(
  projectApiKey: string,
): Promise<void> {
  const envVarContent = `# DO NOT commit this file to your repository!
# The SENTRY_AUTH_TOKEN variable is picked up by the Sentry Build Plugin.
# It's used for authentication when uploading source maps.
# You can also set this env variable in your own \`.env\` files and remove this file.
NEXT_PUBLIC_POSTHOG_API_KEY=${projectApiKey}
`;

  const dotEnvFilePath = join(INSTALL_DIR, DOT_ENV_FILE);
  const dotEnvFileExists = fs.existsSync(dotEnvFilePath);

  if (dotEnvFileExists) {
    const dotEnvFileContent = fs.readFileSync(dotEnvFilePath, 'utf8');

    const hasProjectApiKey = !!dotEnvFileContent.match(
      /^\s*POSTHOG_API_KEY\s*=/g,
    );

    if (hasProjectApiKey) {
      clack.log.warn(
        `${chalk.bold.cyan(
          DOT_ENV_FILE,
        )} already has auth token. Will not add one.`,
      );
    } else {
      try {
        await fs.promises.writeFile(
          dotEnvFilePath,
          `${dotEnvFileContent}\n${envVarContent}`,
          {
            encoding: 'utf8',
            flag: 'w',
          },
        );
        clack.log.success(
          `Added auth token to ${chalk.bold.cyan(DOT_ENV_FILE)}`,
        );
      } catch {
        clack.log.warning(
          `Failed to add auth token to ${chalk.bold.cyan(
            DOT_ENV_FILE,
          )}. Uploading source maps during build will likely not work locally.`,
        );
      }
    }
  } else {
    try {
      await fs.promises.writeFile(dotEnvFilePath, envVarContent, {
        encoding: 'utf8',
        flag: 'w',
      });
      clack.log.success(
        `Created ${chalk.bold.cyan(
          DOT_ENV_FILE,
        )} with auth token for you to test source map uploading locally.`,
      );
    } catch {
      clack.log.warning(
        `Failed to create ${chalk.bold.cyan(
          DOT_ENV_FILE,
        )} with auth token. Uploading source maps during build will likely not work locally.`,
      );
    }
  }

  await addCliConfigFileToGitIgnore(DOT_ENV_FILE);
}

async function addCliConfigFileToGitIgnore(filename: string): Promise<void> {
  const gitignorePath = join(INSTALL_DIR, '.gitignore');

  try {
    const gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf8');
    if (gitignoreContent.split(/\r?\n/).includes(filename)) {
      clack.log.info(
        `${chalk.bold('.gitignore')} already has ${chalk.bold(
          filename,
        )}. Will not add it again.`,
      );
      return;
    }

    await fs.promises.appendFile(
      gitignorePath,
      `\n# Sentry Config File\n${filename}\n`,
      { encoding: 'utf8' },
    );
    clack.log.success(
      `Added ${chalk.cyan(filename)} to ${chalk.cyan('.gitignore')}.`,
    );
  } catch {
    clack.log.error(
      `Failed adding ${chalk.cyan(filename)} to ${chalk.cyan(
        '.gitignore',
      )}. Please add it manually!`,
    );
  }
}

export async function runPrettierIfInstalled(): Promise<void> {
  return traceStep('run-prettier', async () => {
    if (!isInGitRepo()) {
      // We only run formatting on changed files. If we're not in a git repo, we can't find
      // changed files. So let's early-return without showing any formatting-related messages.
      return;
    }

    const changedOrUntrackedFiles = getUncommittedOrUntrackedFiles()
      .map((filename) => {
        return filename.startsWith('- ') ? filename.slice(2) : filename;
      })
      .join(' ');

    if (!changedOrUntrackedFiles.length) {
      // Likewise, if we can't find changed or untracked files, there's no point in running Prettier.
      return;
    }

    const packageJson = await getPackageDotJson();
    const prettierInstalled = hasPackageInstalled('prettier', packageJson);

    Sentry.setTag('prettier-installed', prettierInstalled);

    if (!prettierInstalled) {
      return;
    }

    // prompt the user if they want to run prettier
    const shouldRunPrettier = await abortIfCancelled(
      clack.confirm({
        message:
          'Looks like you have Prettier in your project. Do you want to run it on your files?',
      }),
    );

    if (!shouldRunPrettier) {
      return;
    }

    const prettierSpinner = clack.spinner();
    prettierSpinner.start('Running Prettier on your files.');

    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `npx prettier --ignore-unknown --write ${changedOrUntrackedFiles}`,
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
        );
      });
    } catch (e) {
      prettierSpinner.stop('Prettier failed to run.');
      clack.log.warn(
        'Prettier failed to run. There may be formatting issues in your updated files.',
      );
      return;
    }

    prettierSpinner.stop('Prettier has formatted your files.');
  });
}

/**
 * Checks if @param packageId is listed as a dependency in @param packageJson.
 * If not, it will ask users if they want to continue without the package.
 *
 * Use this function to check if e.g. a the framework of the SDK is installed
 *
 * @param packageJson the package.json object
 * @param packageId the npm name of the package
 * @param packageName a human readable name of the package
 */
export async function ensurePackageIsInstalled(
  packageJson: PackageDotJson,
  packageId: string,
  packageName: string,
): Promise<void> {
  return traceStep('ensure-package-installed', async () => {
    const installed = hasPackageInstalled(packageId, packageJson);

    Sentry.setTag(`${packageName.toLowerCase()}-installed`, installed);

    if (!installed) {
      Sentry.setTag(`${packageName.toLowerCase()}-installed`, false);
      const continueWithoutPackage = await abortIfCancelled(
        clack.confirm({
          message: `${packageName} does not seem to be installed. Do you still want to continue?`,
          initialValue: false,
        }),
      );

      if (!continueWithoutPackage) {
        await abort(undefined, 0);
      }
    }
  });
}

export async function getPackageDotJson(): Promise<PackageDotJson> {
  const packageJsonFileContents = await fs.promises
    .readFile(join(INSTALL_DIR, 'package.json'), 'utf8')
    .catch(() => {
      clack.log.error(
        'Could not find package.json. Make sure to run the wizard in the root of your app!',
      );
      return abort();
    });

  let packageJson: PackageDotJson | undefined = undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    packageJson = JSON.parse(packageJsonFileContents);
  } catch {
    clack.log.error(
      `Unable to parse your ${chalk.cyan(
        'package.json',
      )}. Make sure it has a valid format!`,
    );

    await abort();
  }

  return packageJson || {};
}

export async function updatePackageDotJson(
  packageDotJson: PackageDotJson,
): Promise<void> {
  try {
    await fs.promises.writeFile(
      join(INSTALL_DIR, 'package.json'),
      // TODO: maybe figure out the original indentation
      JSON.stringify(packageDotJson, null, 2),
      {
        encoding: 'utf8',
        flag: 'w',
      },
    );
  } catch {
    clack.log.error(`Unable to update your ${chalk.cyan('package.json')}.`);

    await abort();
  }
}

export async function getPackageManager(): Promise<PackageManager> {
  const detectedPackageManager = detectPackageManger();

  if (detectedPackageManager) {
    return detectedPackageManager;
  }

  const selectedPackageManager: PackageManager | symbol =
    await abortIfCancelled(
      clack.select({
        message: 'Please select your package manager.',
        options: packageManagers.map((packageManager) => ({
          value: packageManager,
          label: packageManager.label,
        })),
      }),
    );

  Sentry.setTag('package-manager', selectedPackageManager.name);

  return selectedPackageManager;
}

export function isUsingTypeScript() {
  try {
    return fs.existsSync(join(INSTALL_DIR, 'tsconfig.json'));
  } catch {
    return false;
  }
}

/**
 * Checks if we already got project data from a previous wizard invocation.
 * If yes, this data is returned.
 * Otherwise, we start the login flow and ask the user to select a project.
 *
 * Use this function to get project data for the wizard.
 *
 * @param options wizard options
 * @param platform the platform of the wizard
 * @returns project data (org, project, token, url)
 */
export async function getOrAskForProjectData(
  _options: WizardOptions,
  platform: string,
): Promise<{
  temporaryAccessToken: string;
  project: PostHogProjectData
  projectApiKey: string;
}> {
  const { project, projectApiKey, temporaryAccessToken } = await traceStep('login', () =>
    askForWizardLogin({
      url: CLOUD_URL,
      platform: 'javascript-nextjs',
    }),
  );

  if (!projectApiKey) {
    clack.log.error(`Didn't receive a project API key. This shouldn't happen :(

Please let us know if you think this is a bug in the wizard:
${chalk.cyan(ISSUES_URL)}`);

    clack.log
      .info(`In the meantime, we'll add a dummy project API key (${chalk.cyan(
        `"${DUMMY_PROJECT_API_KEY}"`,
      )}) for you to replace later.
You can find your project API key here:
${chalk.cyan(`${CLOUD_URL}settings/project#variables`)}`);
  }

  return {
    temporaryAccessToken,
    project,
    projectApiKey: projectApiKey || DUMMY_PROJECT_API_KEY,
  };
}

const skipWizardLogin = true;

async function askForWizardLogin(options: {
  url: string;
  platform?: string;
}): Promise<WizardProjectData> {

  if (skipWizardLogin) {
    return {
      temporaryAccessToken: 'dummy-token',
      project: { id: 'dummy-project', name: 'Dummy Project' },
      projectApiKey: 'dummy-project-api-key',
    };
  }

  let wizardHash: string;

  try {
    wizardHash = (
      await axios.get<{ hash: string }>(`${options.url}api/wizard/`)
    ).data.hash;
  } catch (e: unknown) {
    clack.log.error('Loading wizard failed.');
    clack.log.info(JSON.stringify(e, null, 2));
    await abort(
      chalk.red(
        `Please try again in a few minutes and let us know if this issue persists: ${ISSUES_URL}`,
      ),
    );
  }

  const loginUrl = new URL(`${options.url}wizard?hash=${wizardHash!}`);

  if (options.platform) {
    loginUrl.searchParams.set('platform', options.platform);
  }

  const urlToOpen = loginUrl.toString();

  clack.log.info(
    `${chalk.bold(
      `If the browser window didn't open automatically, please open the following link to login into PostHog:`,
    )}\n\n${chalk.cyan(urlToOpen)}`,
  );

  opn(urlToOpen, { wait: false }).catch(() => {
    // opn throws in environments that don't have a browser (e.g. remote shells) so we just noop here
  });

  const loginSpinner = clack.spinner();

  loginSpinner.start('Waiting for you to log in using the link above');

  const data = await new Promise<WizardProjectData>((resolve) => {
    const pollingInterval = setInterval(() => {
      axios
        .get<{ project_api_key: string; project: PostHogProjectData; temporary_access_token: string }>(
          `${options.url}api/wizard?hash=${wizardHash}`,
          {
            headers: {
              'Accept-Encoding': 'deflate',
            },
          },
        )
        .then((result) => {
          const data: WizardProjectData = {
            projectApiKey: result.data.project_api_key,
            project: result.data.project,
            temporaryAccessToken: result.data.temporary_access_token,
          };

          resolve(data);
          clearTimeout(timeout);
          clearInterval(pollingInterval);
          void axios.delete(`${options.url}api/wizard?hash=${wizardHash}`);
        })
        .catch(() => {
          // noop - just try again
        });
    }, 500);

    const timeout = setTimeout(() => {
      clearInterval(pollingInterval);
      loginSpinner.stop(
        'Login timed out. No worries - it happens to the best of us.',
      );

      Sentry.setTag('opened-wizard-link', false);
      void abort('Please restart the Wizard and log in to complete the setup.');
    }, 180_000);
  });

  loginSpinner.stop('Login complete.');
  Sentry.setTag('opened-wizard-link', true);

  return data;
}

/**
 * Asks users if they have a config file for @param tool (e.g. Vite).
 * If yes, asks users to specify the path to their config file.
 *
 * Use this helper function as a fallback mechanism if the lookup for
 * a config file with its most usual location/name fails.
 *
 * @param toolName Name of the tool for which we're looking for the config file
 * @param configFileName Name of the most common config file name (e.g. vite.config.js)
 *
 * @returns a user path to the config file or undefined if the user doesn't have a config file
 */
export async function askForToolConfigPath(
  toolName: string,
  configFileName: string,
): Promise<string | undefined> {
  const hasConfig = await abortIfCancelled(
    clack.confirm({
      message: `Do you have a ${toolName} config file (e.g. ${chalk.cyan(
        configFileName,
      )})?`,
      initialValue: true,
    }),
  );

  if (!hasConfig) {
    return undefined;
  }

  return await abortIfCancelled(
    clack.text({
      message: `Please enter the path to your ${toolName} config file:`,
      placeholder: join('.', configFileName),
      validate: (value) => {
        if (!value) {
          return 'Please enter a path.';
        }

        try {
          fs.accessSync(value);
        } catch {
          return 'Could not access the file at this path.';
        }
      },
    }),
  );
}

/**
 * Prints copy/paste-able instructions to the console.
 * Afterwards asks the user if they added the code snippet to their file.
 *
 * While there's no point in providing a "no" answer here, it gives users time to fulfill the
 * task before the wizard continues with additional steps.
 *
 * Use this function if you want to show users instructions on how to add/modify
 * code in their file. This is helpful if automatic insertion failed or is not possible/feasible.
 *
 * @param filename the name of the file to which the code snippet should be applied.
 * If a path is provided, only the filename will be used.
 *
 * @param codeSnippet the snippet to be printed. Use {@link makeCodeSnippet}  to create the
 * diff-like format for visually highlighting unchanged or modified lines of code.
 *
 * @param hint (optional) a hint to be printed after the main instruction to add
 * the code from @param codeSnippet to their @param filename.
 *
 * More guidelines on copy/paste instructions:
 * @see {@link https://develop.sentry.dev/sdk/setup-wizards/#copy--paste-snippets}
 *
 * TODO: refactor copy paste instructions across different wizards to use this function.
 *       this might require adding a custom message parameter to the function
 */
export async function showCopyPasteInstructions(
  filename: string,
  codeSnippet: string,
  hint?: string,
): Promise<void> {
  clack.log.step(
    `Add the following code to your ${chalk.cyan(basename(filename))} file:${hint ? chalk.dim(` (${chalk.dim(hint)})`) : ''
    }`,
  );

  // Padding the code snippet to be printed with a \n at the beginning and end
  // This makes it easier to distinguish the snippet from the rest of the output
  // Intentionally logging directly to console here so that the code can be copied/pasted directly
  // eslint-disable-next-line no-console
  console.log(`\n${codeSnippet}\n`);

  await abortIfCancelled(
    clack.select({
      message: 'Did you apply the snippet above?',
      options: [{ label: 'Yes, continue!', value: true }],
      initialValue: true,
    }),
  );
}

/**
 * Callback that exposes formatting helpers for a code snippet.
 * @param unchanged - Formats text as old code.
 * @param plus - Formats text as new code.
 * @param minus - Formats text as removed code.
 */
type CodeSnippetFormatter = (
  unchanged: (txt: string) => string,
  plus: (txt: string) => string,
  minus: (txt: string) => string,
) => string;

/**
 * Crafts a code snippet that can be used to e.g.
 * - print copy/paste instructions to the console
 * - create a new config file.
 *
 * @param colors set this to true if you want the final snippet to be colored.
 * This is useful for printing the snippet to the console as part of copy/paste instructions.
 *
 * @param callback the callback that returns the formatted code snippet.
 * It exposes takes the helper functions for marking code as unchanged, new or removed.
 * These functions no-op if no special formatting should be applied
 * and otherwise apply the appropriate formatting/coloring.
 * (@see {@link CodeSnippetFormatter})
 *
 * @see {@link showCopyPasteInstructions} for the helper with which to display the snippet in the console.
 *
 * @returns a string containing the final, formatted code snippet.
 */
export function makeCodeSnippet(
  colors: boolean,
  callback: CodeSnippetFormatter,
): string {
  const unchanged = (txt: string) => (colors ? chalk.grey(txt) : txt);
  const plus = (txt: string) => (colors ? chalk.greenBright(txt) : txt);
  const minus = (txt: string) => (colors ? chalk.redBright(txt) : txt);

  return callback(unchanged, plus, minus);
}

/**
 * Creates a new config file with the given @param filepath and @param codeSnippet.
 *
 * Use this function to create a new config file for users. This is useful
 * when users answered that they don't yet have a config file for a tool.
 *
 * (This doesn't mean that they don't yet have some other way of configuring
 * their tool but we can leave it up to them to figure out how to merge configs
 * here.)
 *
 * @param filepath absolute path to the new config file
 * @param codeSnippet the snippet to be inserted into the file
 * @param moreInformation (optional) the message to be printed after the file was created
 * For example, this can be a link to more information about configuring the tool.
 *
 * @returns true on success, false otherwise
 */
export async function createNewConfigFile(
  filepath: string,
  codeSnippet: string,
  moreInformation?: string,
): Promise<boolean> {
  if (!isAbsolute(filepath)) {
    debug(`createNewConfigFile: filepath is not absolute: ${filepath}`);
    return false;
  }

  const prettyFilename = chalk.cyan(relative(INSTALL_DIR, filepath));

  try {
    await fs.promises.writeFile(filepath, codeSnippet);

    clack.log.success(`Added new ${prettyFilename} file.`);

    if (moreInformation) {
      clack.log.info(chalk.gray(moreInformation));
    }

    return true;
  } catch (e) {
    debug(e);
    clack.log.warn(
      `Could not create a new ${prettyFilename} file. Please create one manually and follow the instructions below.`,
    );
  }

  return false;
}

export async function askShouldCreateExamplePage(
  customRoute?: string,
): Promise<boolean> {
  const route = chalk.cyan(customRoute ?? '/sentry-example-page');
  return traceStep('ask-create-example-page', () =>
    abortIfCancelled(
      clack.select({
        message: `Do you want to create an example page ("${route}") to test your Sentry setup?`,
        options: [
          {
            value: true,
            label: 'Yes',
            hint: 'Recommended - Check your git status before committing!',
          },
          { value: false, label: 'No' },
        ],
      }),
    ),
  );
}

export async function askShouldCreateExampleComponent(): Promise<boolean> {
  return traceStep('ask-create-example-component', () =>
    abortIfCancelled(
      clack.select({
        message: `Do you want to create an example component to test your Sentry setup?`,
        options: [
          {
            value: true,
            label: 'Yes',
            hint: 'Recommended - Check your git status before committing!',
          },
          { value: false, label: 'No' },
        ],
      }),
    ),
  );
}

export async function featureSelectionPrompt<F extends ReadonlyArray<Feature>>(
  features: F,
): Promise<{ [key in F[number]['id']]: boolean }> {
  return traceStep('feature-selection', async () => {
    const selectedFeatures: Record<string, boolean> = {};

    for (const feature of features) {
      const selected = await abortIfCancelled(
        clack.select({
          message: feature.prompt,
          initialValue: true,
          options: [
            {
              value: true,
              label: 'Yes',
              hint: feature.enabledHint,
            },
            {
              value: false,
              label: 'No',
              hint: feature.disabledHint,
            },
          ],
        }),
      );

      selectedFeatures[feature.id] = selected;
    }

    return selectedFeatures as { [key in F[number]['id']]: boolean };
  });
}

export async function askShouldInstallPackage(
  pkgName: string,
): Promise<boolean> {
  return traceStep(`ask-install-package`, () =>
    abortIfCancelled(
      clack.confirm({
        message: `Do you want to install ${chalk.cyan(pkgName)}?`,
      }),
    ),
  );
}

export async function askShouldAddPackageOverride(
  pkgName: string,
  pkgVersion: string,
): Promise<boolean> {
  return traceStep(`ask-add-package-override`, () =>
    abortIfCancelled(
      clack.confirm({
        message: `Do you want to add an override for ${chalk.cyan(
          pkgName,
        )} version ${chalk.cyan(pkgVersion)}?`,
      }),
    ),
  );
}
