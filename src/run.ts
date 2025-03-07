import { abortIfCancelled } from './utils/clack-utils';

import type { WizardOptions } from './utils/types';
import { detectNextJs, runNextjsWizard } from './nextjs/nextjs-wizard';

import { getIntegrationDescription, Integration } from './lib/constants';
import type { PackageDotJson } from './utils/package-json';
import { readFileSync } from 'node:fs';
import { readEnvironment } from './utils/environment';
import clack from './utils/clack';


type Args = {
  integration?: Integration;
  debug?: boolean;
  forceInstall?: boolean;
};
export async function run(argv: Args) {
  const finalArgs = {
    ...argv,
    ...readEnvironment(),
  };


  clack.intro(`PostHog Wizard ${tryGetWizardVersion()}`);

  const integration = finalArgs.integration ?? await getIntegrationForSetup();


  const wizardOptions: WizardOptions = {
    debug: finalArgs.debug ?? false,
    forceInstall: finalArgs.forceInstall ?? false,
    telemetryEnabled: false,
  };

  switch (integration) {
    case Integration.nextjs:
      await runNextjsWizard(wizardOptions);
      break;

    default:
      clack.log.error('No setup wizard selected!');
  }
}

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
    clack.log.success(`Detected integration: ${getIntegrationDescription(detectedIntegration)}`);
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
