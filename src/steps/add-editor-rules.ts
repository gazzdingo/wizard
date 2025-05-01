import * as fs from 'fs';
import chalk from 'chalk';
import path from 'path';
import { Integration } from '../lib/constants';
import { analytics } from '../utils/analytics';
import clack from '../utils/clack';
import { traceStep } from '../telemetry';
import { abortIfCancelled } from '../utils/clack-utils';

type AddEditorRulesStepOptions = {
  installDir: string;
  rulesName: string;
  integration: Integration;
  default?: boolean;
};

export const addEditorRulesStep = async ({
  installDir,
  rulesName,
  integration,
  default: defaultAddEditorRules,
}: AddEditorRulesStepOptions): Promise<boolean> => {
  // Add rules file if in Cursor environment
  if (process.env.CURSOR_TRACE_ID) {
    const addEditorRules: boolean = defaultAddEditorRules
      ? true
      : await abortIfCancelled(
          clack.select({
            message:
              'Would you like to have PostHog added to your Cursor rules?',
            options: [
              {
                label: 'Yes, please!',
                value: true,
              },
              {
                label: 'No, thanks',
                value: false,
              },
            ],
          }),
        );

    if (!addEditorRules) {
      return false;
    }

    return traceStep('add-editor-rules', async () => {
      const docsDir = path.join(installDir, '.cursor', 'rules');

      await fs.promises.mkdir(docsDir, { recursive: true });

      const frameworkRules = await fs.promises.readFile(
        path.join(__dirname, '..', 'utils', 'rules', rulesName),
        'utf8',
      );
      const universalRulesPath = path.join(
        __dirname,
        '..',
        'utils',
        'rules',
        'universal.md',
      );

      const universalRules = await fs.promises.readFile(
        universalRulesPath,
        'utf8',
      );

      // Replace {universal} placeholder with universal rules content
      const combinedRules = frameworkRules.replace(
        '{universal}',
        universalRules,
      );
      const targetPath = path.join(docsDir, 'posthog-integration.mdc');

      // Write the combined rules
      await fs.promises.writeFile(targetPath, combinedRules, 'utf8');

      analytics.capture('wizard interaction', {
        action: 'added editor rules',
        integration,
      });

      clack.log.info(
        `Added Cursor rules to ${chalk.bold.cyan(
          `.cursor/rules/posthog-integration.mdc`,
        )}`,
      );

      return true;
    });
  }

  return false;
};
