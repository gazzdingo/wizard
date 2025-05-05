#!/usr/bin/env node
import { satisfies } from 'semver';
import { red } from './src/utils/logging';
import { config } from 'dotenv';
config({
  path: __dirname + '/.env',
});

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const NODE_VERSION_RANGE = '>=18.20.0';

// Have to run this above the other imports because they are importing clack that
// has the problematic imports.
if (!satisfies(process.version, NODE_VERSION_RANGE)) {
  red(
    `GrowthBook Wizard requires Node.js ${NODE_VERSION_RANGE}. You are using Node.js ${process.version}. Please upgrade your Node.js version.`,
  );
  process.exit(1);
}
import { run } from './src/run';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
const argv = yargs(hideBin(process.argv)).options({
  debug: {
    default: false,
    describe: 'Enable verbose logging\nenv: GROWTHBOOK_WIZARD_DEBUG',
    type: 'boolean',
  },
}).argv;

void run(argv);
