import chalk from 'chalk';
import type { UsingCloud, WizardOptions } from '../utils/types';
import { getCloudUrlFromRegion } from '../utils/urls';
import type { PackageManager } from '../utils/package-manager';
import { ISSUES_URL, Integration } from './constants';
import { SUPPORTED_INTEGRATIONS } from './config';

export const getPRDescription = ({
  integration,
  addedEditorRules,
}: {
  integration: Integration;
  addedEditorRules: boolean;
}) => {
  const integrationConfig = SUPPORTED_INTEGRATIONS.find((config) => config.id === integration);

  return `This PR adds an integration for Growthbook.

  The following changes were made:
  ${integrationConfig?.featuresDescription}
  ${addedEditorRules ? `• Added Cursor rules for Growthbook\n` : ''}
  
  
  Note: This used the ${
    integrationConfig?.label
  } wizard to setup Growthbook, this is still in alpha and like all AI, might have got it wrong. Please check the installation carefully!
  
  Learn more about Growthbook + ${integrationConfig?.label}: ${
    integrationConfig?.docsUrl
  }`;
};

export const getOutroMessage = ({
  options,
  integration,
  usingCloud,
  addedEditorRules,
  packageManager,
  envFileChanged,
  prUrl,
}: {
  options: WizardOptions;
  integration: Integration;
  usingCloud: UsingCloud;
  addedEditorRules: boolean;
  packageManager?: PackageManager;
  envFileChanged?: string;
  prUrl?: string;
}) => {
  const continueUrl = options.signup
    ? `${getCloudUrlFromRegion(usingCloud)}/products?source=wizard`
    : undefined;

  const integrationConfig = SUPPORTED_INTEGRATIONS.find((config) => config.id === integration);

  return `
${chalk.green('Successfully installed Growthbook!')}  
  
${chalk.cyan('Changes made:')}
${integrationConfig?.featuresDescription}
${addedEditorRules ? `• Added Cursor rules for Growthbook\n` : ''}${
    prUrl ? `• Created a PR for your changes: ${chalk.cyan(prUrl)}\n` : ''
  }${
    envFileChanged
      ? `• Added your Project API key to your ${envFileChanged} file\n`
      : ''
  }
${chalk.yellow('Next steps:')}
${integrationConfig?.nextSteps}

Learn more about Growthbook + ${integrationConfig?.label}: ${chalk.cyan(
    integrationConfig?.docsUrl ?? '',
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
