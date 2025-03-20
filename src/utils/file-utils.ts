import path from 'path';
import fs from 'fs';
import type { CloudRegion, FileChange, WizardOptions } from './types';
import clack from './clack';
import z from 'zod';
import { query } from './query';
import type { PromptTemplate } from '@langchain/core/prompts';
import type { InputValues } from '@langchain/core/utils/types';
import { analytics } from './analytics';
import type { Integration } from '../lib/constants';
import { abort } from './clack-utils';
import { INTEGRATION_CONFIG } from '../lib/config';

export const GLOBAL_IGNORE_PATTERN = [
  'node_modules',
  'dist',
  'build',
  'public',
  'static',
  '.git',
  '.next',
];
export async function getAllFilesInProject(dir: string): Promise<string[]> {
  let results: string[] = [];

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (GLOBAL_IGNORE_PATTERN.some((pattern) => fullPath.includes(pattern))) {
      continue;
    }

    if (entry.isDirectory()) {
      // Recursively get files from subdirectories
      const subDirFiles = await getAllFilesInProject(fullPath);
      results = results.concat(subDirFiles);
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

export function getDotGitignore({
  installDir,
}: Pick<WizardOptions, 'installDir'>) {
  const gitignorePath = path.join(installDir, '.gitignore');
  const gitignoreExists = fs.existsSync(gitignorePath);

  if (gitignoreExists) {
    return gitignorePath;
  }

  return undefined;
}

export async function updateFile(
  change: FileChange,
  { installDir }: Pick<WizardOptions, 'installDir'>,
) {
  const dir = path.dirname(path.join(installDir, change.filePath));
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(installDir, change.filePath),
    change.newContent,
  );
}

export async function getFilesToChange({
  prompt,
  wizardHash,
  cloudRegion,
}: {
  prompt: string;
  wizardHash: string;
  cloudRegion: CloudRegion;
}) {
  const filterFilesSpinner = clack.spinner();

  filterFilesSpinner.start('Selecting files to change...');

  const filterFilesResponseSchmea = z.object({
    files: z.array(z.string()),
  });

  const filterFilesResponse = await query({
    message: prompt,
    schema: filterFilesResponseSchmea,
    wizardHash,
    region: cloudRegion,
  });

  const filesToChange = filterFilesResponse.files;

  filterFilesSpinner.stop(`Found ${filesToChange.length} files to change`);

  return filesToChange;
}

export async function generateFileContent({
  prompt,
  wizardHash,
  cloudRegion,
}: {
  prompt: string,
  wizardHash: string;
  cloudRegion: CloudRegion;
}) {

  const response = await query({
    message: prompt,
    schema: z.object({
      newContent: z.string(),
    }),
    wizardHash: wizardHash,
    region: cloudRegion,
  });

  return response.newContent;
}

export async function generateFileChangesForIntegration({
  integration,
  filesToChange,
  wizardHash,
  options,
}: {
  integration: Integration;
  filesToChange: string[];
  wizardHash: string;
  options: Pick<WizardOptions, 'installDir'>;
}) {
  const changes: FileChange[] = [];

  for (const filePath of filesToChange) {
    const fileChangeSpinner = clack.spinner();

    analytics.capture('wizard interaction', {
      action: 'processing file',
      integration,
      file: filePath,
    });

    try {
      let oldContent = undefined;
      try {
        oldContent = await fs.promises.readFile(
          path.join(options.installDir, filePath),
          'utf8',
        );
      } catch (readError) {
        if (readError.code !== 'ENOENT') {
          await abort(`Error reading file ${filePath}`);
          continue;
        }
      }

      fileChangeSpinner.start(
        `${oldContent ? 'Updating' : 'Creating'} file ${filePath}`,
      );

      const unchangedFiles = filesToChange.filter(
        (filePath) => !changes.some((change) => change.filePath === filePath),
      );

      const generateFileContent = INTEGRATION_CONFIG[integration].generateFileContent;

      const newContent = await generateFileContent({
        prompt: generateFileChangesPrompt,
        wizardHash,
      });

      if (newContent !== oldContent) {
        await updateFile({ filePath, oldContent, newContent }, options);
        changes.push({ filePath, oldContent, newContent });
      }

      fileChangeSpinner.stop(
        `${oldContent ? 'Updated' : 'Created'} file ${filePath}`,
      );

      analytics.capture('wizard interaction', {
        action: 'processed file',
        integration,
        file: filePath,
      });
    } catch (error) {
      await abort(`Error processing file ${filePath}`);
    }
  }

  return changes;
}