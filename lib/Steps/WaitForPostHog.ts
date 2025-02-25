import type { Answers } from 'inquirer';

import { BottomBar } from '../Helper/BottomBar';
import { getCurrentIntegration } from '../Helper/Wizard';
import { BaseStep } from './BaseStep';

export class WaitForPostHog extends BaseStep {
  public async emit(answers: Answers): Promise<Answers> {
    if (!(await getCurrentIntegration(answers).shouldEmit(answers))) {
      return {};
    }
    if (this._argv.skipConnect) {
      return {};
    }

    if (!answers.hash) {
      throw new Error(`No wizard hash found ${answers}`);
    }

    return new Promise((resolve, _reject) => {
      this.debug(answers);

      BottomBar.show('Waiting for PostHog...');
      const baseUrl = this._argv.url;

      const pingPostHog = async (): Promise<void> => {
        const response = await fetch(`${baseUrl}api/wizard?hash=${answers.hash}`);
        this.debug('Polling received data');
        if (!response.ok) {
          throw new Error(
            `Received status ${response.status} ${response.statusText}`,
          );
        }
        const data = await response.json();
        // Delete the wizard hash since we were able to fetch the data
        await fetch(`${baseUrl}api/wizard?hash=${answers.hash}`, {
          method: 'DELETE',
        });
        BottomBar.hide();
        this.debug('Polling Success!');
        resolve({ wizard: data });
      };

      const poll = (): void => {
        this.debug(`Polling: ${baseUrl}api/wizard?hash=${answers.hash}`);
        pingPostHog().catch((e) => {
          this.debug('Polling received:');
          this.debug(e);
          setTimeout(poll, 1000);
        });
      };

      poll();
    });
  }
}
