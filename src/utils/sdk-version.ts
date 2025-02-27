// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import { minVersion } from 'semver';
import {
  abortIfCancelled,
  getPackageDotJson,
  installPackage,
} from './clack-utils';

import * as Sentry from '@sentry/node';
import { findInstalledPackageFromList } from './package-json';

const MINIMUM_SUPPORTED_PACKAGE_VERSIONS: Record<string, string> = {
  'posthog-node': '1.0.0',
  'posthog-js': '1.0.0',
}

// This array is orderd by the SDKs we want to check for first.
// The reason is that some SDKs depend on others and some users might
// have added the dependencies to their package.json. We want to make sure
// that we actually detect the "top-level" SDK first.
const POSTHOG_PACKAGE_NAMES = [
  'posthog-node',
  'posthog-js',
];

/**
 * Check for a minimum SDK version and prompt the user to upgrade if necessary.
 * We distinguish between 4 cases here:
 *
 * 1. Users didn't install any SDK yet
 *    -> We tell them to install an SDK and then continue with the wizard
 * 2. Users installed an SDK in the range >=7.47.0
 *    -> All good, no need to do anything!
 * 3. Users installed an SDK in the range >=7.0.0 <= 7.46.0
 *    -> We ask if they want to auto-update to the latest version
 * 4. Users installed an SDK in the range <7.x
 *    -> We tell users to manually upgrade (migrate between majors)
 */
export async function ensureMinimumSdkVersionIsInstalled(): Promise<void> {
  const installedSdkPackage = findInstalledPackageFromList(
    POSTHOG_PACKAGE_NAMES,
    await getPackageDotJson(),
  );

  // Case 1:
  if (!installedSdkPackage) {
    return await handleNoSdkInstalled();
  }

  const { name: installedSdkName, version: installedSdkVersionOrRange } =
    installedSdkPackage;

  Sentry.setTag('installed-sdk', installedSdkName);

  const minInstalledVersion = getMinInstalledVersion(
    installedSdkVersionOrRange,
    installedSdkName,
  );

  if (!minInstalledVersion) {
    // This is handled in the getMinInstalledVersion function
    return;
  }

  await handleAutoUpdateSdk(installedSdkName);
}

async function handleAutoUpdateSdk(packageName: string) {

  const shouldUpdate = await abortIfCancelled(
    clack.select({
      message:
        'Do you want to automatically update your SDK to the latest version?',
      options: [
        {
          label: 'Yes!',
          value: true,
          hint: chalk.green('Recommended'),
        },
        {
          label: "No, I'll do it later...",
          value: false,
          hint: chalk.yellow(
            `Remember to update your SDK to at least ${MINIMUM_SUPPORTED_PACKAGE_VERSIONS[packageName]}.`,
          ),
        },
      ],
      initialValue: true,
    }),
  );

  if (shouldUpdate) {
    await installPackage({
      packageName,
      alreadyInstalled: true,
      askBeforeUpdating: false, // we already did this above
    });
  }

  Sentry.setTag(
    'resolved-sdk-status',
    shouldUpdate ? 'updated-automatically' : 'update-later',
  );
}

async function handleNoSdkInstalled(): Promise<void> {
  Sentry.setTag('initial-sdk-version', 'none');
  Sentry.setTag('installed-sdk', 'none');

  clack.log.warn(
    `${chalk.yellowBright(
      `It seems like you didn't yet install a Sentry SDK in your project.`,
    )}
We recommend setting up the SDK before continuing with the source maps wizard.

${chalk.dim(`Take a look at our docs to get started:
https://docs.sentry.io/`)}`,
  );

  const installedSDK = await abortIfCancelled(
    clack.select({
      message: 'Did you set up your Sentry SDK?',
      options: [
        { label: 'Yes, continue!', value: true },
        {
          label: "I'll do it later...",
          value: false,
          hint: chalk.yellow(
            'You need to set up an SDK before you can use Sentry',
          ),
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag(
    'resolved-sdk-status',
    installedSDK ? 'installed-manually' : 'install-later',
  );
}

function getMinInstalledVersion(
  installedSdkVersionOrRange: string,
  installedSdkName: string,
): string | undefined {
  try {
    // If `minVersion` is unable to parse the version it will throw an error
    // However, it will also return `null` if the parameter is undefined, which
    // we explicitly checked before but the typing doesn't know that.
    const minInstalledVersion = minVersion(installedSdkVersionOrRange)?.version;
    if (minInstalledVersion) {
      return minInstalledVersion;
    }
  } catch {
    // handling this, along with the `null` case below
  }

  Sentry.setTag('initial-sdk-version', 'unknown');
  clack.log.warn(
    `${chalk.yellow(
      `Could not parse the version of your installed SDK ("${installedSdkName}": "${installedSdkVersionOrRange}")`,
    )}

Please make sure that your PostHog SDK is updated to version ${chalk.bold(
      MINIMUM_SUPPORTED_PACKAGE_VERSIONS[installedSdkName],
    )} or newer.
    `,
  );

  return undefined;
}
