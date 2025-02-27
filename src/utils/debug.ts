// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { prepareMessage } from './logging';


let debugEnabled = false;

export function debug(...args: unknown[]) {
  if (!debugEnabled) {
    return;
  }

  const msg = args.map((a) => prepareMessage(a)).join(' ');

  clack.log.info(chalk.dim(msg));
}

export function enableDebugLogs() {
  debugEnabled = true;
}
