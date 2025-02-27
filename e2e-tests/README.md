# End-to-end Tests for PostHog Wizard

## Structure

```
test-applications/
|---- nextjs-app-router-test-app/
tests/
|---- nextjs-app-router.test.ts
```

### Utilities

`utils/` contains helpers such as the wizard runner, assertion tools and file modifiers that can be used in (`*.test.ts`).

#### Helpers

- `startWizardInstance` - Starts a new instance of `WizardTestEnv`.

- `initGit` - Initializes a temporary git repository in the test project.
- `cleanupGit` - Cleans up the temporary git repository in the test project.
- `revertLocalChanges` - Reverts local changes (git tracked or untracked) in the test project.

- `createFile` - Creates a file (optionally with content) in the test project.
- `modifyFile` - Modifies a file in the test project.

- `checkFileExists` - Checks if a file exists in the test project.
- `checkPackageJson` - Checks if the package package exists in the dependencies of the test project's `package.json`.

- `checkIfBuilds` - Checks if the test project builds successfully.
- `checkIfRunsOnDevMode` - Checks if the test project runs on dev mode successfully.
- `checkIfRunsOnProdMode` - Checks if the test project runs on prod mode successfully.

#### `WizardTestEnv`

`WizardTestEnv` is a class that can be used to run the PostHog Wizard in a test environment. It provides methods to run the wizard with specific arguments and stdio.

## Running Tests Locally

First, you need to create a `.env` file set the environment variables from the `.env.example` file in the root of the project.

Tests can be run locally from the root of the project with:

`pnpm test:e2e`

To run a specific test application

`pnpm test:e2e NextJS`

## Writing Tests

Each test file should contain a single test suite that tests the PostHog Wizard for a specific framework. The test suite should contain a `beforeAll` and `afterAll` function that starts and stops the test application respectively.
