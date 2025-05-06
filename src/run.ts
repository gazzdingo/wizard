import { abortIfCancelled } from './utils/clack-utils';

import { runNextjsWizard } from './nextjs/nextjs-wizard';
import type { UsingCloud, WizardOptions } from './utils/types';

import { getIntegrationDescription, Integration } from './lib/constants';
import { readEnvironment } from './utils/environment';
import clack from './utils/clack';
import path from 'path';
import { SUPPORTED_INTEGRATIONS, INTEGRATION_ORDER } from './lib/config';
import { runReactWizard } from './react/react-wizard';
import { analytics } from './utils/analytics';
import { runSvelteWizard } from './svelte/svelte-wizard';
import { runReactNativeWizard } from './react-native/react-native-wizard';
import { EventEmitter } from 'events';

EventEmitter.defaultMaxListeners = 50;

type Args = {
  integration?: Integration;
  debug?: boolean;
  forceInstall?: boolean;
  installDir?: string;
  usingCloud?: UsingCloud;
  default?: boolean;
  signup?: boolean;
};

export async function run(argv: Args) {
  await runWizard(argv);
}

async function runWizard(argv: Args) {
  const finalArgs = {
    ...argv,
    ...readEnvironment(),
  };

  const wizardOptions: WizardOptions = {
    debug: finalArgs.debug ?? false,
    forceInstall: finalArgs.forceInstall ?? false,
    installDir: finalArgs.installDir
      ? path.join(process.cwd(), finalArgs.installDir)
      : process.cwd(),
    usingCloud: finalArgs.usingCloud ?? true,
    default: finalArgs.default ?? false,
    signup: finalArgs.signup ?? false,
  };

  clack.intro(`Welcome to the GrowthBook setup wizard ✨`);
  
  const integration = await getIntegrationForSetup(wizardOptions);

  analytics.setTag('integration', integration);

  switch (integration) {
    case Integration.nextjs:
      await runNextjsWizard(wizardOptions);
      break;
    case Integration.react:
      await runReactWizard(wizardOptions);
      break;
    case Integration.svelte:
      await runSvelteWizard(wizardOptions);
      break;
    case Integration.reactNative:
      await runReactNativeWizard(wizardOptions);
      break;
    default:
       
  }
}

async function detectIntegration(
  options: Pick<WizardOptions, 'installDir'>,
): Promise<Integration | undefined> {
  const integrationConfigs = Object.entries(SUPPORTED_INTEGRATIONS).sort(
    ([a], [b]) =>
      INTEGRATION_ORDER.indexOf(a as Integration) -
      INTEGRATION_ORDER.indexOf(b as Integration),
  );

  for (const [integration, config] of integrationConfigs) {
    try {
      const detected = await config.detect(options);
      if (detected) {
        return integration as Integration;
      }
    } catch (error) {
      // If there's an error reading package.json or detecting, continue to next integration
      continue;
    }
  }
  return undefined;
}

async function getIntegrationForSetup(
  options: Pick<WizardOptions, 'installDir'>,
) {
  const detectedIntegration = await detectIntegration(options);

  // if (detectedIntegration !== undefined) {
  //   clack.log.success(
  //     `Detected integration: ${getIntegrationDescription(detectedIntegration)}`,
  //   );
  //   return detectedIntegration;
  // }

  clack.log.info('No integration detected. Please select one manually:');

  const integration: Integration = await abortIfCancelled(
    clack.select({
      message: 'What do you want to set up?',
      options: [
        { value: Integration.nextjs, label: 'Next.js' },
        { value: Integration.react, label: 'React' },
        { value: Integration.svelte, label: 'Svelte' },
        { value: Integration.reactNative, label: 'React Native' },
      ],
    }),
  );

  return integration;
}
