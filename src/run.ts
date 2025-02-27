// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import { abortIfCancelled } from './utils/clack-utils';
import 'dotenv/config'

import type { WizardOptions } from './utils/types';
import { detectNextJs, runNextjsWizard } from './nextjs/nextjs-wizard';

import { Integration, type Platform } from '../lib/Constants';
import type { PackageDotJson } from './utils/package-json';
import { readFileSync } from 'node:fs';
import { readEnvironment } from './utils/environment';

type WizardIntegration = 'nextjs';

type Args = {
  integration?: WizardIntegration;

  uninstall: boolean;
  signup: boolean;
  skipConnect: boolean;
  debug: boolean;
  quiet: boolean;
  disableTelemetry: boolean;

  url?: string;
  platform?: Platform[];
  org?: string;
  project?: string;
  cloud?: boolean;
  forceInstall?: boolean;
};
export async function run(argv: Args) {
  const finalArgs = {
    ...argv,
    ...readEnvironment(),
  };


  clack.intro(`PostHog Wizard ${tryGetWizardVersion()}`);

  const integration = await getIntegrationForSetup();


  const wizardOptions: WizardOptions = {
    telemetryEnabled: !finalArgs.disableTelemetry,
    forceInstall: finalArgs.forceInstall,
    cloud: finalArgs.cloud,
    url: finalArgs.url,
  };

  switch (integration) {
    case Integration.nextjs:
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


async function detectIntegration(): Promise<Integration | undefined> {

  const detectors = [
    detectNextJs
  ]

  for (const detector of detectors) {
    const integration = await detector();
    if (integration) {
      return integration;
    }
  }
}

async function getIntegrationForSetup() {

  const detectedIntegration = await detectIntegration();

  if (detectedIntegration) {
    clack.log.info(`Detected integration: ${detectedIntegration.toUpperCase()}`);
    return detectedIntegration;
  }

  const integration: Integration = await abortIfCancelled(
    clack.select({
      message: 'What do you want to set up?',
      options: [{ value: Integration.nextjs, label: 'Next.js' }],
    }),
  );

  return integration;
}
