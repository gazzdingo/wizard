import chalk from 'chalk';
import { DEBUG, type Integration } from '../lib/constants';
import { traceStep } from '../telemetry';
import { analytics } from '../utils/analytics';
import clack from '../utils/clack';
import { abortIfCancelled, isInGitRepo } from '../utils/clack-utils';
import * as childProcess from 'node:child_process';
import { getPRDescription } from '../lib/messages';

export const PR_CONFIG = {
  defaultBranchName: 'posthog-integration',
  defaultTitle: 'feat: add PostHog integration',
} as const;

interface GitCommandResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function execGitCommand(
  command: string,
  cwd: string,
): Promise<GitCommandResult<string>> {
  return new Promise((resolve) => {
    childProcess.exec(command, { cwd }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr || err.message });
      } else {
        resolve({ success: true, data: stdout.trim() });
      }
    });
  });
}

export async function getCurrentBranch(
  installDir: string,
): Promise<GitCommandResult<string>> {
  return execGitCommand('git rev-parse --abbrev-ref HEAD', installDir);
}

export async function checkGitHubAuth(
  installDir: string,
): Promise<GitCommandResult<string>> {
  return execGitCommand('gh auth status', installDir);
}

export async function checkBranchExists(
  branch: string,
  installDir: string,
): Promise<GitCommandResult<boolean>> {
  const result = await execGitCommand(
    `git rev-parse --verify ${branch}`,
    installDir,
  );
  // If the command fails, the branch does not exist
  if (!result.success) {
    return { success: true, data: true };
  }
  // If the command succeeds, the branch exists
  return { success: false, data: false };
}

export async function createBranch(
  branch: string,
  installDir: string,
): Promise<GitCommandResult<string>> {
  return execGitCommand(`git checkout -b ${branch}`, installDir);
}

export async function stageChanges(
  installDir: string,
): Promise<GitCommandResult<string>> {
  return execGitCommand('git add .', installDir);
}

export async function checkForEnvFiles(
  installDir: string,
): Promise<GitCommandResult<boolean>> {
  const result = await execGitCommand(
    'git diff --cached --name-only',
    installDir,
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }
  const files = result.data
    ? result.data
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean)
    : [];
  const hasEnv = files.some((f) => f.startsWith('.env'));
  return { success: true, data: hasEnv };
}

export async function commitChanges(
  message: string,
  installDir: string,
): Promise<GitCommandResult<string>> {
  return execGitCommand(`git commit -m "${message}"`, installDir);
}

export async function pushBranch(
  branch: string,
  installDir: string,
): Promise<GitCommandResult<string>> {
  return execGitCommand(`git push -u origin ${branch}`, installDir);
}

export async function createGitHubPR(
  baseBranch: string,
  newBranch: string,
  title: string,
  body: string,
  installDir: string,
): Promise<GitCommandResult<string>> {
  return execGitCommand(
    `gh pr create --base ${baseBranch} --head ${newBranch} --title "${title}" --body "${body}"`,
    installDir,
  );
}

interface CreatePRStepOptions {
  installDir: string;
  integration: Integration;
  addedEditorRules: boolean;
}

export async function createPRStep({
  installDir,
  integration,
  addedEditorRules,
}: CreatePRStepOptions): Promise<string | undefined> {
  return traceStep('create-pr', async () => {
    if (!isInGitRepo()) {
      clack.log.warn('Not in a git repository. Cannot create a pull request.');
      return;
    }

    // Get current branch
    const currentBranchResult = await getCurrentBranch(installDir);
    if (!currentBranchResult.success || !currentBranchResult.data) {
      analytics.capture('wizard interaction', {
        action: 'skipping pr creation',
        reason: 'failed to get current branch',
        error: currentBranchResult.error,
        integration,
      });

      if (DEBUG) {
        clack.log.error(
          currentBranchResult.error ?? 'Failed to get current branch',
        );
      }

      return;
    }
    const baseBranch = currentBranchResult.data;

    if (!['main', 'master'].includes(baseBranch)) {
      analytics.capture('wizard interaction', {
        action: 'skipping pr creation',
        reason: 'not on main or master',
        base_branch: baseBranch,
        integration,
      });

      if (DEBUG) {
        clack.log.error(`Not on main or master. Skipping PR creation.`);
      }
      return;
    }

    // Check GitHub auth
    const authResult = await checkGitHubAuth(installDir);
    if (!authResult.success) {
      analytics.capture('wizard interaction', {
        action: 'skipping pr creation',
        reason: 'not logged into github',
        integration,
      });

      if (DEBUG) {
        clack.log.error(authResult.error ?? 'Failed to check github auth');
      }

      return;
    }

    const newBranch = PR_CONFIG.defaultBranchName;

    // Check if branch exists
    const branchExistsResult = await checkBranchExists(newBranch, installDir);
    if (!branchExistsResult.success) {
      analytics.capture('wizard interaction', {
        action: 'skipping pr creation',
        reason: 'branch already exists',
        error: branchExistsResult.error,
        integration,
      });

      if (DEBUG) {
        clack.log.error(
          branchExistsResult.error ?? 'Failed to check branch exists',
        );
      }

      return;
    }

    const prTitle = PR_CONFIG.defaultTitle;
    const prDescription = getPRDescription({
      integration,
      addedEditorRules,
    });

    const createPR = await abortIfCancelled(
      clack.select({
        message: 'Would you like to create a PR automatically?',
        initialValue: true,
        options: [
          {
            value: true,
            label: 'Yes',
            hint: 'We will create a PR for you',
          },
          {
            value: false,
            label: 'No',
            hint: 'You can create a PR manually later',
          },
        ],
      }),
    );

    if (!createPR) {
      clack.log.info('Skipping PR creation');
      return;
    }

    // Create branch
    const createBranchResult = await createBranch(newBranch, installDir);
    if (!createBranchResult.success) {
      analytics.capture('wizard interaction', {
        action: 'aborting pr creation',
        reason: 'failed to create branch',
        error: createBranchResult.error,
        integration,
      });
      clack.log.warn('Failed to create branch. Aborting PR creation 🚶‍➡️');
      return;
    }

    // Stage changes
    const stageResult = await stageChanges(installDir);
    if (!stageResult.success) {
      analytics.capture('wizard interaction', {
        action: 'aborting pr creation',
        reason: 'failed to stage changes',
        error: stageResult.error,
        integration,
      });
      clack.log.warn('Failed to stage changes. Aborting PR creation 🚶‍➡️');
      return;
    }

    // Check for env files
    const envCheckResult = await checkForEnvFiles(installDir);
    if (!envCheckResult.success) {
      analytics.capture('wizard interaction', {
        action: 'aborting pr creation',
        reason: 'failed to check for env files in staged changes',
        error: envCheckResult.error,
        integration,
      });
      clack.log.warn(
        'Failed to check for .env files. Aborting PR creation 🚶‍➡️',
      );
      return;
    }

    if (envCheckResult.data) {
      clack.log.warn(
        'Found .env files in staged changes. Aborting PR creation to prevent exposing sensitive data 🔐',
      );
      analytics.capture('wizard interaction', {
        action: 'aborting pr creation',
        reason: 'env files detected in staged changes',
        integration,
      });
      return;
    }

    // Commit changes
    const commitSpinner = clack.spinner();
    commitSpinner.start('Committing changes...');
    const commitResult = await commitChanges(prTitle, installDir);
    if (!commitResult.success) {
      commitSpinner.stop(
        'Failed to commit changes. Aborting PR creation 🚶‍➡️',
      );
      analytics.capture('wizard interaction', {
        action: 'aborting pr creation',
        reason: 'failed to commit changes',
        error: commitResult.error,
        integration,
      });
      return;
    }
    commitSpinner.stop('Changes committed successfully.');

    // Push branch
    const pushSpinner = clack.spinner();
    pushSpinner.start('Pushing branch to remote...');
    const pushResult = await pushBranch(newBranch, installDir);
    if (!pushResult.success) {
      pushSpinner.stop('Failed to push branch. Aborting PR creation 🚶‍➡️');
      analytics.capture('wizard interaction', {
        action: 'aborting pr creation',
        reason: 'failed to push branch',
        error: pushResult.error,
        integration,
      });
      return;
    }
    pushSpinner.stop('Branch pushed successfully.');

    // Create PR
    const prSpinner = clack.spinner();
    prSpinner.start(
      `Creating a PR on branch '${newBranch}' with base '${baseBranch}'...`,
    );
    const prResult = await createGitHubPR(
      baseBranch,
      newBranch,
      prTitle,
      prDescription,
      installDir,
    );
    if (!prResult.success || !prResult.data) {
      prSpinner.stop(
        `Failed to create PR on branch '${newBranch}'. Aborting PR creation 🚶‍➡️`,
      );
      analytics.capture('wizard interaction', {
        action: 'aborting pr creation',
        reason: 'failed to create pr',
        error: prResult.error,
        integration,
      });
      return;
    }

    const prUrl = prResult.data;
    prSpinner.stop(
      `Successfully created PR! 🎉 You can review it here: ${chalk.cyan(
        prUrl,
      )}`,
    );

    analytics.capture('wizard interaction', {
      action: 'pr created',
      branch: newBranch,
      base_branch: baseBranch,
      integration,
    });

    return prUrl;
  });
}
