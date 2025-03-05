import { PostHog } from 'posthog-node';
import { ANALYTICS_HOST_URL, ANALYTICS_POSTHOG_KEY } from '../../lib/constants';
export class Analytics {
  private client: PostHog;
  private tags: Record<string, string | boolean | number | null | undefined> =
    {};
  private distinctId?: string;

  constructor() {
    this.client = new PostHog(
      ANALYTICS_POSTHOG_KEY,
      {
        host: ANALYTICS_HOST_URL,
      },
    );

    this.tags = {};

    this.distinctId = undefined;
  }

  setDistinctId(distinctId: string) {
    this.distinctId = distinctId;
  }

  setTag(key: string, value: string | boolean | number | null | undefined) {
    this.tags[key] = value;
  }

  async captureAndFlush(eventName: string) {
    if (Object.keys(this.tags).length === 0) {
      return;
    }

    if (!this.distinctId) {
      // If not identified, don't send any tag data.
      return;
    }

    this.client.capture({
      distinctId: this.distinctId,
      event: eventName,
      properties: {
        tags: this.tags,
      },
    });

    await this.client.flush();
  }
}

export const analytics = new Analytics();
