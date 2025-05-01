import * as childProcess from 'node:child_process';
import type { ExecException } from 'node:child_process';
import {
  checkBranchExists,
  checkForEnvFiles,
  checkGitHubAuth,
  commitChanges,
  createBranch,
  createGitHubPR,
  getCurrentBranch,
  pushBranch,
  stageChanges,
} from '../create-pr';

// Mock dependencies
jest.mock('node:child_process', () => ({
  exec: jest.fn(),
}));

type ExecCallback = (
  error: ExecException | null,
  stdout: string,
  stderr: string,
) => void;

type TestCase = {
  fn: (...args: any[]) => Promise<any>;
  args: readonly any[];
  command: string;
  name: string;
};

describe('Git operations', () => {
  const execMock = childProcess.exec as unknown as jest.Mock;
  const testDir = '/test/dir';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentBranch', () => {
    it('should return the current branch name on success', async () => {
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, 'main', '');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await getCurrentBranch(testDir);
      expect(result).toEqual({ success: true, data: 'main' });
      expect(execMock).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: testDir },
        expect.any(Function),
      );
    });

    it('should return error on failure', async () => {
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(new Error('git error'), '', 'Failed to get branch');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await getCurrentBranch(testDir);
      expect(result).toEqual({ success: false, error: 'Failed to get branch' });
    });
  });

  describe('checkForEnvFiles', () => {
    it('should return true when .env files are found', async () => {
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, '.env\n.env.local', '');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await checkForEnvFiles(testDir);
      expect(result).toEqual({ success: true, data: true });
    });

    it('should return false when no .env files are found', async () => {
      const error = new Error('No match') as ExecException;
      error.code = 1;
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(error, '', 'command failed with exit code 1');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await checkForEnvFiles(testDir);
      expect(result).toEqual({
        success: false,
        error: 'command failed with exit code 1',
      });
    });

    it('should handle grep errors correctly', async () => {
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(new Error('grep error'), '', 'Some other error');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await checkForEnvFiles(testDir);
      expect(result).toEqual({ success: false, error: 'Some other error' });
    });
  });

  describe('checkBranchExists', () => {
    it('should return success when branch does not exist', async () => {
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(new Error('branch not found'), '', 'fatal: not a valid ref');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await checkBranchExists('new-branch', testDir);
      expect(result).toEqual({ success: true, data: true });
    });

    it('should return failure when branch exists', async () => {
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, 'ref exists', '');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await checkBranchExists('existing-branch', testDir);
      expect(result).toEqual({ success: false, data: false });
    });
  });

  describe('createGitHubPR', () => {
    it('should create PR successfully', async () => {
      const prUrl = 'https://github.com/org/repo/pull/1';
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(null, prUrl, '');
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await createGitHubPR(
        'main',
        'feature',
        'title',
        'body',
        testDir,
      );
      expect(result).toEqual({ success: true, data: prUrl });
      expect(execMock).toHaveBeenCalledWith(
        'gh pr create --base main --head feature --title "title" --body "body"',
        { cwd: testDir },
        expect.any(Function),
      );
    });

    it('should handle PR creation failure', async () => {
      execMock.mockImplementation(
        (_cmd: string, _opts: any, callback: ExecCallback) => {
          callback(
            new Error('PR creation failed'),
            '',
            'Authentication failed',
          );
          return {} as childProcess.ChildProcess;
        },
      );

      const result = await createGitHubPR(
        'main',
        'feature',
        'title',
        'body',
        testDir,
      );
      expect(result).toEqual({
        success: false,
        error: 'Authentication failed',
      });
    });
  });

  describe('Git operations', () => {
    const testCases: TestCase[] = [
      {
        fn: createBranch,
        args: ['new-branch', testDir] as const,
        command: 'git checkout -b new-branch',
        name: 'createBranch',
      },
      {
        fn: stageChanges,
        args: [testDir] as const,
        command: 'git add .',
        name: 'stageChanges',
      },
      {
        fn: commitChanges,
        args: ['commit message', testDir] as const,
        command: 'git commit -m "commit message"',
        name: 'commitChanges',
      },
      {
        fn: pushBranch,
        args: ['branch-name', testDir] as const,
        command: 'git push -u origin branch-name',
        name: 'pushBranch',
      },
      {
        fn: checkGitHubAuth,
        args: [testDir] as const,
        command: 'gh auth status',
        name: 'checkGitHubAuth',
      },
    ];

    testCases.forEach(({ fn, args, command, name }) => {
      it(`${name} should execute correctly`, async () => {
        execMock.mockImplementation(
          (_cmd: string, _opts: any, callback: ExecCallback) => {
            callback(null, 'success', '');
            return {} as childProcess.ChildProcess;
          },
        );

        const result = await fn(...args);
        expect(result).toEqual({ success: true, data: 'success' });
        expect(execMock).toHaveBeenCalledWith(
          command,
          { cwd: testDir },
          expect.any(Function),
        );
      });

      it(`${name} should handle errors`, async () => {
        execMock.mockImplementation(
          (_cmd: string, _opts: any, callback: ExecCallback) => {
            callback(new Error('operation failed'), '', 'Command failed');
            return {} as childProcess.ChildProcess;
          },
        );

        const result = await fn(...args);
        expect(result).toEqual({ success: false, error: 'Command failed' });
      });
    });
  });
});
