#!/usr/bin/env node
import { satisfies } from 'semver';
import { red } from './src/utils/logging';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const NODE_VERSION_RANGE = '>=18.20.0';

// Have to run this above the other imports because they are importing clack that
// has the problematic imports.
if (!satisfies(process.version, NODE_VERSION_RANGE)) {
  red(
    `PostHog Wizard requires Node.js ${NODE_VERSION_RANGE}. You are using Node.js ${process.version}. Please upgrade your Node.js version.`,
  );
  process.exit(1);
}
import { run } from './src/run';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const argv = yargs(hideBin(process.argv)).options({
  debug: {
    default: false,
    describe: 'Enable verbose logging\nenv: POSTHOG_WIZARD_DEBUG',
    type: 'boolean',
  },
  'disable-telemetry': {
    default: false,
    describe: "Don't send telemetry data to PostHog",
    type: 'boolean',
  },
  'project-api-key': {
    default: undefined,
    describe: 'Project API key',
  },
}).argv;

// @ts-expect-error - for some reason TS doesn't recognize the aliases as valid properties
// meaning it only knows e.g. u but not url. Maybe a bug in this old version of yargs?
// Can't upgrade yargs though without dropping support for Node 14.
void run(argv);
