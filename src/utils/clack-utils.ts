import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { basename, isAbsolute, join, relative } from 'node:path';
import chalk from 'chalk';
import { traceStep } from '../telemetry';
import { debug } from './debug';
import { type PackageDotJson, hasPackageInstalled } from './package-json';
import {
  type PackageManager,
  detectPackageManger,
  packageManagers,
} from './package-manager';
import { fulfillsVersionRange } from './semver';
import type { UsingCloud, Feature, WizardOptions } from './types';
import {
  DEFAULT_HOST_URL,
  DUMMY_PROJECT_API_KEY,
  ISSUES_URL,
} from '../lib/constants';
import { analytics } from './analytics';
import clack from './clack';
import { getCloudUrlFromRegion } from './urls';
import { v4 as uuidv4 } from 'uuid';
import opn from 'opn';

interface ProjectData {
  projectApiKey: string;
  host: string;
  wizardHash: string;
  distinctId: string;
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

export function abort(message?: string, status?: number): Promise<never> {
  analytics.shutdown('cancelled');

  clack.outro(message ?? 'Wizard setup cancelled.');
  return process.exit(status ?? 1);
}

export async function abortIfCancelled<T>(
  input: T | Promise<T>,
): Promise<Exclude<T, symbol>> {
  analytics.shutdown('cancelled');

  if (clack.isCancel(await input)) {
    clack.cancel('Wizard setup cancelled.');
    process.exit(0);
  } else {
    return input as Exclude<T, symbol>;
  }
}

export const printWelcome = (options: {
  wizardName: string;
  message?: string;
}): void => {
  // eslint-disable-next-line no-console
  console.log('');
  clack.intro(chalk.inverse(` ${options.wizardName} `));

  const welcomeText =
    options.message ||
    `The ${options.wizardName} will help you set up GrowthBook for your application.\nThank you for using GrowthBook :)`;

  clack.note(welcomeText);
};

export async function confirmContinueIfNoOrDirtyGitRepo(
  options: Pick<WizardOptions, 'default'>,
): Promise<void> {
  return traceStep('check-git-status', async () => {
    if (!isInGitRepo()) {
      const continueWithoutGit = options.default
        ? true
        : await abortIfCancelled(
            clack.confirm({
              message:
                'You are not inside a git repository. The wizard will create and update files. Do you want to continue anyway?',
            }),
          );

      analytics.setTag('continue-without-git', continueWithoutGit);

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
      const continueWithDirtyRepo = options.default
        ? true
        : await abortIfCancelled(
            clack.confirm({
              message: 'Do you want to continue anyway?',
            }),
          );

      analytics.setTag('continue-with-dirty-repo', continueWithDirtyRepo);

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
    analytics.setTag(`${packageName.toLowerCase()}-version`, packageVersion);
    const isSupportedVersion = fulfillsVersionRange({
      acceptableVersions,
      version: packageVersion,
      canBeLatest: true,
    });

    if (isSupportedVersion) {
      analytics.setTag(`${packageName.toLowerCase()}-supported`, true);
      return;
    }

    clack.log.warn(
      `You have an unsupported version of ${packageName} installed:

  ${packageId}@${packageVersion}`,
    );

    clack.note(
      note ??
        `Please upgrade to ${acceptableVersions} if you wish to use the GrowthBook Wizard.`,
    );
    const continueWithUnsupportedVersion = await abortIfCancelled(
      clack.confirm({
        message: 'Do you want to continue anyway?',
      }),
    );
    analytics.setTag(
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
  integration,
  installDir,
}: {
  /** The string that is passed to the package manager CLI as identifier to install (e.g. `@growthbook/growthbook-react`, or `@growthbook/growthbook-react@^2.0.0`) */
  packageName: string;
  alreadyInstalled: boolean;
  askBeforeUpdating?: boolean;
  /** Overrides what is shown in the installation logs in place of the `packageName` option. Useful if the `packageName` is ugly */
  packageNameDisplayLabel?: string;
  packageManager?: PackageManager;
  /** Add force install flag to command to skip install precondition fails */
  forceInstall?: boolean;
  /** The integration that is being used */
  integration?: string;
  /** The directory to install the package in */
  installDir: string;
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

    const pkgManager =
      packageManager || (await getPackageManager({ installDir }));

    sdkInstallSpinner.start(
      `${alreadyInstalled ? 'Updating' : 'Installing'} ${chalk.bold.cyan(
        packageNameDisplayLabel ?? packageName,
      )} with ${chalk.bold(pkgManager.label)}.`,
    );

    try {
      await new Promise<void>((resolve, reject) => {
        childProcess.exec(
          `${pkgManager.installCommand} ${packageName} ${pkgManager.flags} ${
            forceInstall ? pkgManager.forceInstallFlag : ''
          }`,
          { cwd: installDir },
          (err, stdout, stderr) => {
            if (err) {
              // Write a log file so we can better troubleshoot issues
              const filename = join(
                os.tmpdir(),
                `growthbook-wizard-installation-error-${Date.now()}.log`,
              );
              const errorString = JSON.stringify({
                stdout,
                stderr,
              });
              fs.writeFileSync(filename, errorString, 'utf8');

              reject(err);
              return;
            } else {
              resolve();
            }
          },
        );
      });
    } catch (e) {
      sdkInstallSpinner.stop('Installation failed.');
      clack.log.error(
        `Could not install package(s) automatically.\n\n${e}\n\nThe wizard has created a \`growthbook-wizard-installation-error-*.log\` file. If you think this issue is caused by the GrowthBook Wizard, create an issue on GitHub and include the log file's content:\n${ISSUES_URL}`,
      );
      await abort();
    }

    sdkInstallSpinner.stop(
      `${alreadyInstalled ? 'Updated' : 'Installed'} ${chalk.bold.cyan(
        packageNameDisplayLabel ?? packageName,
      )} with ${chalk.bold(pkgManager.label)}.`,
    );

    analytics.capture('wizard interaction', {
      action: 'package installed',
      package_name: packageName,
      package_manager: pkgManager.name,
      integration,
    });

    return { packageManager: pkgManager };
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

    analytics.setTag(`${packageName.toLowerCase()}-installed`, installed);

    if (!installed) {
      analytics.setTag(`${packageName.toLowerCase()}-installed`, false);
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

export async function getPackageDotJson({
  installDir,
}: Pick<WizardOptions, 'installDir'>): Promise<PackageDotJson> {
  const packageJsonFileContents = await fs.promises
    .readFile(join(installDir, 'package.json'), 'utf8')
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
  { installDir }: Pick<WizardOptions, 'installDir'>,
): Promise<void> {
  try {
    await fs.promises.writeFile(
      join(installDir, 'package.json'),
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

export async function getPackageManager({
  installDir,
}: Pick<WizardOptions, 'installDir'>): Promise<PackageManager> {
  const detectedPackageManager = detectPackageManger({ installDir });

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

  analytics.setTag('package-manager', selectedPackageManager.name);

  return selectedPackageManager;
}

export function isUsingTypeScript({
  installDir,
}: Pick<WizardOptions, 'installDir'>) {
  try {
    return fs.existsSync(join(installDir, 'tsconfig.json'));
  } catch {
    return false;
  }
}

/**
 *
 * Use this function to get project data for the wizard.
 *
 * @param options wizard options
 * @returns project data (token, url)
 */
export async function getOrAskForProjectData(
  _options: WizardOptions & {
    usingCloud: UsingCloud;
    host: string;
    apiHost: string;
  },
): Promise<{token: string, orgId: string}> {
  const cloudUrl = getCloudUrlFromRegion(_options.usingCloud);
  const {token, orgId} = await traceStep('login', () => askForWizardLogin(_options));

  if (!token) {
    clack.log.error(`Didn't receive a project API key. This shouldn't happen :(

Please let us know if you think this is a bug in the wizard:
${chalk.cyan(ISSUES_URL)}`);

    clack.log
      .info(`In the meantime, we'll add a dummy project API key (${chalk.cyan(
      `"${DUMMY_PROJECT_API_KEY}"`,
    )}) for you to replace later.
You can find your Project API key here:
${chalk.cyan(`${cloudUrl}/settings/project#variables`)}`);
  }

  return {token, orgId};
}

interface IdTokenResponse {
  idToken?: string;
}

async function pollForIdToken(
  apiHost: string,
  wizardHash: string,
): Promise<{token: string, orgId: string}> {
  const startTime = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes in milliseconds
  const interval = 5000; // 5 seconds in milliseconds

  while (Date.now() - startTime < timeout) {
    const response = await fetch(
      `${apiHost}/auth/wizard-hash?wizardHash=${wizardHash}`,
    );
    const tokenData = (await response.json()) as IdTokenResponse;
    if (tokenData?.idToken) {
      const userData = await fetch(`${apiHost}/user`, {
        headers: {
          Authorization: `Bearer ${tokenData.idToken}`,
        },
      });
      const userDataJson = await userData.json() as {organizations: {id: string}[]};
      console.log(userDataJson);
      const orgId = userDataJson?.organizations?.[0]?.id;

      return {token: tokenData.idToken, orgId};

    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Failed to login');
}

export async function askForWizardLogin(
  _options: WizardOptions & {
    usingCloud: UsingCloud;
    host: string;
    apiHost: string;
  },
): Promise<{token: string, orgId: string}> {
  const wizardHash = uuidv4();

  const url = `${_options.host}?wizardHash=${wizardHash}`;
  clack.log.info(`Please open this URL in your browser to continue: ${url}`);
  await opn(url, { wait: false });

  const {token, orgId} = await pollForIdToken(_options.apiHost, wizardHash);
  if (!token) {
    clack.cancel('Failed to login');
  }

  return {token, orgId};
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
 * TODO: refactor copy paste instructions across different wizards to use this function.
 *       this might require adding a custom message parameter to the function
 */
export async function showCopyPasteInstructions(
  filename: string,
  codeSnippet: string,
  hint?: string,
): Promise<void> {
  clack.log.step(
    `Add the following code to your ${chalk.cyan(basename(filename))} file:${
      hint ? chalk.dim(` (${chalk.dim(hint)})`) : ''
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
  { installDir }: Pick<WizardOptions, 'installDir'>,
  moreInformation?: string,
): Promise<boolean> {
  if (!isAbsolute(filepath)) {
    debug(`createNewConfigFile: filepath is not absolute: ${filepath}`);
    return false;
  }

  const prettyFilename = chalk.cyan(relative(installDir, filepath));

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
/**
 * ask for the Growthbook API key
 * @param options api key
 * @returns
 */
export async function askForGrowthbookApiKey() {
  return await traceStep('ask-for-growthbook-api-key', async () => {
    const growthbookApiKey = await abortIfCancelled(
      clack.text({
        message: 'What is your Growthbook API key?',
        placeholder: 'your-api-key-here',
      }),
    );

    return growthbookApiKey;
  });
}

export async function askForAIConsent(options: Pick<WizardOptions, 'default'>) {
  return await traceStep('ask-for-ai-consent', async () => {
    const aiConsent = options.default
      ? true
      : await abortIfCancelled(
          clack.select({
            message: 'This setup as uses AI, are you happy to continue? ✨',
            options: [
              {
                label: 'Yes',
                value: true,
                hint: 'We will use AI to help you setup Growthbook quickly',
              },
              {
                label: 'No',
                value: false,
                hint: "I don't like AI",
              },
            ],
            initialValue: true,
          }),
        );

    return aiConsent;
  });
}
/**
 * ask the user what there self hosted url is
 */
export async function askForSelfHostedUrl(): Promise<{
  host: string;
  apiHost: string;
}> {
  return await traceStep('ask-for-host', async () => {
    const host = await abortIfCancelled(
      clack.text({
        message: 'What is your self hosted Growthbook URL?',
        placeholder: 'https://app.growthbook.io',
        defaultValue: "http://localhost:3000"
      }),
    );
    const apiHost = await abortIfCancelled(
      clack.text({
        message: 'What is your self hosted Growthbook API?',
        placeholder: 'https://api.growthbook.io',
        defaultValue: "http://localhost:3100"
      }),
    );

    return {host, apiHost};
  });
}

/**
 * Asks the user if they are using Growthbook Cloud or Self Hosted.
 * @returns true if they are using Growthbook Cloud, false otherwise
 */
export async function isUsingCloud(): Promise<UsingCloud> {
  return await traceStep('ask-for-using-cloud', async () => {
    const usingCloud: UsingCloud = await abortIfCancelled(
      clack.select({
        message: 'Select where you are Hosting Growthbook',
        options: [
          {
            label: 'Cloud',
            value: true,
          },
          {
            label: 'Self Hosted',
            value: false,
          },
        ],
      }),
    );

    return usingCloud;
  });
}
export async function chooseSdkConnection(
  showNewConnection: boolean,
  sdkConnections: {
    id: string;
    name: string;
  }[],
): Promise<string> {
  return await traceStep('choose-sdk-connection', async () => {
    const sdkConnection: string = await abortIfCancelled(
      clack.select({
        message: 'Select the SDK connection you want to use',
        options: [
          ...(showNewConnection ? [{
            label: 'New Connection',
            value: 'new',
          }] : []),
          ...sdkConnections.map((sdkConnection) => ({
            label: sdkConnection.name,
            value: sdkConnection.id,
          })),
        ],
      }),
    );

    return sdkConnection;
  });
}
export async function openNewConnection(host: string): Promise<void> {
  await opn(`${host}/sdks`, {wait: false});
  await traceStep('open-new-connection', async () => {
    // create a continue button
    await abortIfCancelled(
      clack.select({
        message: 'Continue',
        options: [{label: 'Continue', value: true}],
      }),
    );
  });
}
