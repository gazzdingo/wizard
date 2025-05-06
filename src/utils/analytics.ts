import { v4 as uuidv4 } from 'uuid';
import { GrowthBook } from '@growthbook/growthbook';

export class Analytics {
  private client: GrowthBook;
  private tags: Record<string, string | boolean | number | null | undefined> =
    {};
  private distinctId?: string;
  private anonymousId: string;

  constructor() {
    this.tags = {};
    this.anonymousId = uuidv4();
    this.distinctId = undefined;
    this.client = new GrowthBook();
  }

  setDistinctId(distinctId: string) {
    this.distinctId = distinctId;
    // this.client.setAttributes({ id: distinctId });
  }

  setTag(key: string, value: string | boolean | number | null | undefined) {
    this.tags[key] = value;
  }

  capture(_eventName: string, _properties?: Record<string, unknown>) {
    return;
  }

  shutdown(status: 'success' | 'error' | 'cancelled') {
    if (Object.keys(this.tags).length === 0) {
      return;
    }

    this.client.log('setup wizard finished', {
      status,
      tags: this.tags,
    });
  }
}

export const analytics = new Analytics();
