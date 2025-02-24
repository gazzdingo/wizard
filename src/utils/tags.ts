// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

export const setTag = (key: string, value: string | boolean | number) => {
  clack.log.info(`Setting tag ${key} to ${value}`);
};
