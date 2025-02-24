import type { Answers } from 'inquirer';

import { dim, green } from '../Helper/Logging';
import { BaseStep } from './BaseStep';

export class Welcome extends BaseStep {
  private static _didShow = false;

  // eslint-disable-next-line @typescript-eslint/require-await
  public async emit(_answers: Answers): Promise<Answers> {
    if (Welcome._didShow) {
      return {};
    }
    if (this._argv.uninstall === false) {
      green('PostHog Wizard will help you to configure your project');
      dim('Thank you for using PostHog :)');
    }
    Welcome._didShow = true;
    return {};
  }
}
