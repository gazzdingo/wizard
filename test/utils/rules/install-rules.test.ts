import * as fs from 'fs';
import path from 'path';
import { addEditorRules } from '../../../src/utils/rules/add-editor-rules';
import { analytics } from '../../../src/utils/analytics';
import clack from '../../../src/utils/clack';
import { Integration } from '../../../src/lib/constants';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

jest.mock('../../../src/utils/analytics', () => ({
  analytics: {
    capture: jest.fn(),
    setTag: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/utils/clack', () => ({
  log: {
    info: jest.fn(),
  },
  select: jest.fn().mockResolvedValue(true),
  isCancel: jest.fn((value: unknown): value is symbol => false),
  cancel: jest.fn(),
}));

describe('addEditorRules', () => {
  const mockOptions = {
    installDir: '/test/dir',
    rulesName: 'test-rules.md',
    integration: 'react' as Integration,
  };

  const originalEnv = process.env;
  const mkdirMock = fs.promises.mkdir as jest.Mock;
  const readFileMock = fs.promises.readFile as jest.Mock;
  const writeFileMock = fs.promises.writeFile as jest.Mock;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const captureMock = analytics.capture as jest.Mock;
  const infoMock = clack.log.info as jest.Mock;
  const selectMock = clack.select as jest.Mock;
  const isCancelMock = clack.isCancel as unknown as jest.Mock;
  const cancelMock = clack.cancel as jest.Mock;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    // Clear mock implementations
    (fs.promises.mkdir as jest.Mock).mockReset();
    (fs.promises.readFile as jest.Mock).mockReset();
    (fs.promises.writeFile as jest.Mock).mockReset();
    selectMock.mockReset();
    selectMock.mockResolvedValue(true); // Default to "Yes" for the prompt
    isCancelMock.mockReset();
    isCancelMock.mockReturnValue(false);
    cancelMock.mockReset();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should not install rules when CURSOR_TRACE_ID is not set', async () => {
    delete process.env.CURSOR_TRACE_ID;

    await addEditorRules(mockOptions);

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('should install rules when CURSOR_TRACE_ID is set', async () => {
    process.env.CURSOR_TRACE_ID = 'test-trace-id';

    const mockFrameworkRules = 'framework rules {universal} content';
    const mockUniversalRules = 'universal rules content';
    const expectedCombinedRules =
      'framework rules universal rules content content';

    (fs.promises.readFile as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve(mockFrameworkRules))
      .mockImplementationOnce(() => Promise.resolve(mockUniversalRules));

    await addEditorRules(mockOptions);

    // Check if directory was created
    expect(mkdirMock).toHaveBeenCalledWith(
      path.join('/test/dir', '.cursor', 'rules'),
      { recursive: true },
    );

    // Check if correct files were read
    expect(readFileMock).toHaveBeenCalledWith(
      path.join(
        path.dirname(
          require.resolve('../../../src/utils/rules/add-editor-rules'),
        ),
        mockOptions.rulesName,
      ),
      'utf8',
    );
    expect(readFileMock).toHaveBeenCalledWith(
      path.join(
        path.dirname(
          require.resolve('../../../src/utils/rules/add-editor-rules'),
        ),
        'universal.md',
      ),
      'utf8',
    );

    // Check if combined rules were written correctly
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join('/test/dir', '.cursor', 'rules', 'posthog-integration.mdc'),
      expectedCombinedRules,
      'utf8',
    );

    // Check if analytics were captured
    expect(captureMock).toHaveBeenCalledWith('wizard interaction', {
      action: 'added editor rules',
      integration: mockOptions.integration,
    });

    // Check if success message was logged
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining(path.join('/test/dir', '.cursor', 'rules')),
    );
  });

  it('should handle file system errors gracefully', async () => {
    process.env.CURSOR_TRACE_ID = 'test-trace-id';
    const mockError = new Error('File not found');

    // Mock readFile to throw an error
    (fs.promises.readFile as jest.Mock).mockRejectedValue(mockError);

    await expect(addEditorRules(mockOptions)).rejects.toThrow(mockError);

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('should handle missing rules files gracefully', async () => {
    process.env.CURSOR_TRACE_ID = 'test-trace-id';
    const mockError = new Error('File system error');

    // Mock mkdir to throw an error
    (fs.promises.mkdir as jest.Mock).mockRejectedValue(mockError);

    await expect(addEditorRules(mockOptions)).rejects.toThrow(mockError);

    expect(writeFileMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('should correctly substitute universal rules with realistic content', async () => {
    process.env.CURSOR_TRACE_ID = 'test-trace-id';

    const mockFrameworkRules = `---
description: apply when interacting with PostHog/analytics tasks
globs: 
alwaysApply: true
---

{universal}

# Framework-specific rules
- Rule 1
- Rule 2`;

    const mockUniversalRules = `Never hallucinate an API key. Instead, always use the API key populated in the .env file.

# Feature flags

A given feature flag should be used in as few places as possible. Do not increase the risk of undefined behavior by scattering the same feature flag across multiple areas of code.`;

    const expectedCombinedRules = `---
description: apply when interacting with PostHog/analytics tasks
globs: 
alwaysApply: true
---

Never hallucinate an API key. Instead, always use the API key populated in the .env file.

# Feature flags

A given feature flag should be used in as few places as possible. Do not increase the risk of undefined behavior by scattering the same feature flag across multiple areas of code.

# Framework-specific rules
- Rule 1
- Rule 2`;

    (fs.promises.readFile as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve(mockFrameworkRules))
      .mockImplementationOnce(() => Promise.resolve(mockUniversalRules));

    await addEditorRules(mockOptions);

    // Check if directory was created
    expect(mkdirMock).toHaveBeenCalledWith(
      path.join('/test/dir', '.cursor', 'rules'),
      { recursive: true },
    );

    // Check if correct files were read
    expect(readFileMock).toHaveBeenCalledWith(
      path.join(
        path.dirname(
          require.resolve('../../../src/utils/rules/add-editor-rules'),
        ),
        mockOptions.rulesName,
      ),
      'utf8',
    );
    expect(readFileMock).toHaveBeenCalledWith(
      path.join(
        path.dirname(
          require.resolve('../../../src/utils/rules/add-editor-rules'),
        ),
        'universal.md',
      ),
      'utf8',
    );

    // Check if combined rules were written correctly with proper formatting preserved
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join('/test/dir', '.cursor', 'rules', 'posthog-integration.mdc'),
      expectedCombinedRules,
      'utf8',
    );

    // Check if analytics were captured
    expect(captureMock).toHaveBeenCalledWith('wizard interaction', {
      action: 'added editor rules',
      integration: mockOptions.integration,
    });

    // Check if success message was logged
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining(path.join('/test/dir', '.cursor', 'rules')),
    );
  });

  it('should not install rules when user declines', async () => {
    process.env.CURSOR_TRACE_ID = 'test-trace-id';
    selectMock.mockResolvedValue(false);

    await addEditorRules(mockOptions);

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(readFileMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
  });
});
