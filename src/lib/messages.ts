import chalk from 'chalk';
import type { CloudRegion, WizardOptions } from '../utils/types';
import { getCloudUrlFromRegion } from '../utils/urls';
import type { PackageManager } from '../utils/package-manager';
import { ISSUES_URL, Integration } from './constants';
import { INTEGRATION_CONFIG } from './config';

export const getOutroMessage = ({
  options,
  integration,
  cloudRegion,
  addedEditorRules,
  packageManager,
}: {
  options: WizardOptions;
  integration: Integration;
  cloudRegion: CloudRegion;
  addedEditorRules: boolean;
  packageManager?: PackageManager;
}) => {
  const continueUrl = options.signup
    ? `${getCloudUrlFromRegion(cloudRegion)}/products?source=wizard`
    : undefined;

  const integrationConfig = INTEGRATION_CONFIG[integration];

  return `
${chalk.green('Successfully installed PostHog!')}  
  
${chalk.cyan('Changes made:')}
${integrationConfig.changes}
${addedEditorRules ? `• Added Cursor rules for PostHog` : ''}
  
${chalk.yellow('Next steps:')}
${integrationConfig.nextSteps}

Learn more about PostHog + ${integrationConfig.name}: ${chalk.cyan(
    integrationConfig.docsUrl,
  )}
${continueUrl ? `\nContinue onboarding: ${chalk.cyan(continueUrl)}\n` : ``}
Note: This uses experimental AI to setup your project. It might have got it wrong, please check!

You should validate your setup by (re)starting your dev environment${
    packageManager
      ? ` (e.g. ${chalk.cyan(`${packageManager.runScriptCommand} dev`)}).`
      : `.`
  }

${chalk.dim(`If you encounter any issues, let us know here: ${ISSUES_URL}`)}`;
};
