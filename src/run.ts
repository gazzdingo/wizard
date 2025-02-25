// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { abortIfCancelled } from './utils/clack-utils';

import type { PreselectedProject, WizardOptions } from './utils/types';
import { runNextjsWizard } from './nextjs/nextjs-wizard';
import { readEnvironment } from '../lib/Helper/Env';
import type { Platform } from '../lib/Constants';
import type { PackageDotJson } from './utils/package-json';
import { readFileSync } from 'node:fs';

type WizardIntegration = 'nextjs';

type Args = {
  integration?: WizardIntegration;

  uninstall: boolean;
  signup: boolean;
  skipConnect: boolean;
  debug: boolean;
  quiet: boolean;
  disableTelemetry: boolean;
  preSelectedProject?: {
    authToken: string;
    selfHosted: boolean;
    dsn: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
    orgId: string;
    orgName: string;
    orgSlug: string;
  };
  url?: string;
  platform?: Platform[];
  org?: string;
  project?: string;
  cloud?: boolean;
  forceInstall?: boolean;
};

function preSelectedProjectArgsToObject(
  args: Args,
): PreselectedProject | undefined {
  if (!args.preSelectedProject) {
    return undefined;
  }

  return {
    authToken: args.preSelectedProject.authToken,
    selfHosted: args.preSelectedProject.selfHosted,
    project: {
      id: args.preSelectedProject.projectId,
      keys: [
        {
          dsn: {
            public: args.preSelectedProject.dsn,
          },
        },
      ],
      organization: {
        id: args.preSelectedProject.orgId,
        name: args.preSelectedProject.orgName,
        slug: args.preSelectedProject.orgSlug,
      },
      slug: args.preSelectedProject.projectSlug,
    },
  };
}

export async function run(argv: Args) {
  const finalArgs = {
    ...argv,
    ...readEnvironment(),
  };

  let integration = finalArgs.integration;
  if (!integration) {
    clack.intro(`PostHog Wizard ${tryGetWizardVersion()}`);

    integration = await abortIfCancelled(
      clack.select({
        message: 'What do you want to set up?',
        options: [{ value: 'nextjs', label: 'Next.js' }],
      }),
    );

    if (!integration) {
      clack.log.error('No integration selected. Exiting.');
      return;
    }

    clack.outro(`Starting ${integration} setup`);
  }

  const wizardOptions: WizardOptions = {
    telemetryEnabled: !finalArgs.disableTelemetry,
    forceInstall: finalArgs.forceInstall,
  };

  switch (integration) {
    case 'nextjs':
      await runNextjsWizard(wizardOptions);
      break;

    default:
      clack.log.error('No setup wizard selected!');
  }
}

/**
 * TODO: replace with rollup replace whenever we switch to rollup
 */
function tryGetWizardVersion(): string {
  let version = process.env.npm_package_version;
  if (!version) {
    try {
      const wizardPkgJson = JSON.parse(
        readFileSync('../package.json', 'utf-8'),
      ) as PackageDotJson;
      version = wizardPkgJson.version;
    } catch {
      // ignore
    }
  }
  return version ?? '';
}
