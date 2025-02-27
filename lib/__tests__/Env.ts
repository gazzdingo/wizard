import { readEnvironment } from '../Helper/Env';

describe('read-env', () => {
  test('transform', () => {
    // @ts-ignore: true not assignable to string/undefined
    process.env.POSTHOG_WIZARD_DEBUG = true;
    process.env.POSTHOG_WIZARD_OPENAI_API_KEY = 'test-key';
    // @ts-ignore: true not assignable to string/undefined
    process.env.POSTHOG_WIZARD_URL = 'https://posthog.com';
    expect(readEnvironment()).toEqual({
      debug: true,
      openaiApiKey: 'test-key',
      url: 'https://posthog.com',
    });
  });
});
