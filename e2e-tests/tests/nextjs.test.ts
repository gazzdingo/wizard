/* eslint-disable jest/expect-expect */
import {
  cleanupGit,
  revertLocalChanges,
} from '../utils';
import { startWizardInstance } from '../utils';
import {
  checkIfBuilds,
  checkIfRunsOnDevMode,
  checkIfRunsOnProdMode,
  checkPackageJson,
} from '../utils';
import * as path from 'path';

describe('NextJS', () => {
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nextjs-test-app',
  );

  beforeAll(async () => {
    const wizardInstance = startWizardInstance(projectDir);

    // TODO: Step through the wizard - mocking queries

    wizardInstance.kill();
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  test('package.json is updated correctly', () => {
    checkPackageJson(projectDir, 'posthog-js');
    checkPackageJson(projectDir, 'posthog-node');
  });

  test('runs on dev mode correctly', async () => {
    await checkIfRunsOnDevMode(projectDir, 'Ready in');
  });

  test('builds correctly', async () => {
    await checkIfBuilds(projectDir);
  });

  test('runs on prod mode correctly', async () => {
    await checkIfRunsOnProdMode(projectDir, 'Ready in');
  });
});
