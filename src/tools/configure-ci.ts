import chalk from "chalk";
import { SENTRY_DOT_ENV_FILE } from "../utils/clack-utils";
// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import { abortIfCancelled } from "../utils/clack-utils";
import { traceStep } from "../telemetry";
import * as Sentry from '@sentry/node';
import type { SupportedTools } from "../utils/detect-tool";

export async function configureCI(
  selectedTool: SupportedTools,
  authToken: string,
): Promise<void> {
  const isUsingCI = await abortIfCancelled(
    clack.select({
      message: `Are you using a CI/CD tool to build and deploy your application?`,
      options: [
        {
          label: 'Yes',
          hint: 'I use a tool like GitHub Actions, GitLab, CircleCI, TravisCI, Jenkins, Vercel, ...',
          value: true,
        },
        {
          label: 'No',
          hint: 'I build and deploy my application manually',
          value: false,
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('using-ci', isUsingCI);



  const authTokenFile = SENTRY_DOT_ENV_FILE;

  if (!isUsingCI) {
    clack.log.info(
      `No Problem! Just make sure that the Sentry auth token from ${chalk.cyan(
        authTokenFile,
      )} is available whenever you build and deploy your app.`,
    );
    return;
  }

  await traceStep('ci-auth-token-setup', () => setupAuthTokenInCI(authToken));
}

async function setupAuthTokenInCI(authToken: string) {
  clack.log.step(
    'Add the Sentry authentication token as an environment variable to your CI setup:',
  );

  // Intentially logging directly to console here so that the code can be copied/pasted directly
  // eslint-disable-next-line no-console
  console.log(
    chalk.greenBright(`
SENTRY_AUTH_TOKEN=${authToken}
`),
  );

  clack.log.warn(
    chalk.yellow('DO NOT commit this auth token to your repository!'),
  );

  const addedEnvVarToCI = await abortIfCancelled(
    clack.select({
      message: 'Did you configure CI as shown above?',
      options: [
        { label: 'Yes, continue!', value: true },
        {
          label: "I'll do it later...",
          value: false,
          hint: chalk.yellow(
            'You need to set the auth token to upload source maps in CI',
          ),
        },
      ],
      initialValue: true,
    }),
  );

  Sentry.setTag('added-env-var-to-ci', addedEnvVarToCI);

  if (!addedEnvVarToCI) {
    clack.log.info("Don't forget! :)");
  }
}