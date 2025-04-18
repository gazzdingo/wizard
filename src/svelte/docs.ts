export const getSvelteDocumentation = ({
  language,
}: {
  language: 'typescript' | 'javascript';
}) => {
  return `
==============================
FILE: Root layout.${
    language === 'typescript' ? 'ts' : 'js'
  } file (e.g routes/+layout.${language === 'typescript' ? 'ts' : 'js'})
LOCATION: Usually placed at the root of the app (e.g src/routes/+layout.${
    language === 'typescript' ? 'ts' : 'js'
  })
==============================
Changes:
- Add a load function to initialize PostHog, checking if the browser is available to make sure it only initializes on the client
Example:
--------------------------------------------------
import posthog from 'posthog-js'
import { browser } from '$app/environment';
import { PUBLIC_POSTHOG_KEY } from '$env/static/public';

export const load = async () => {

  if (browser) {
    posthog.init(
      PUBLIC_POSTHOG_KEY,
      {
        api_host: PUBLIC_POSTHOG_HOST,
        capture_pageview: false,
        capture_pageleave: false
      }
    )
  }
  return
};
--------------------------------------------------

==============================
File: Root layout .svelte file (e.g routes/+layout.svelte)
LOCATION: Usually placed at the root of the app (e.g src/routes/+layout.svelte)
==============================
Changes:
- Add pageview & pageleave tracking to the layout

Example:
--------------------------------------------------
<script>
  import { browser } from '$app/environment';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import posthog from 'posthog-js'

  if (browser) {
    beforeNavigate(() => posthog.capture('$pageleave'));
    afterNavigate(() => posthog.capture('$pageview'));
  }
</script>
--------------------------------------------------

==============================
File: PostHog server initializion
LOCATION: With other server-side code, e.g. src/lib/server/posthog${
    language === 'typescript' ? '.ts' : '.js'
  }
==============================
Changes:
- Initialize a PostHog client for the server using posthog-node that can be used in other server-side code
Example:
--------------------------------------------------
import posthog, { PostHog } from 'posthog-node';
import { PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST } from '$env/static/public';

let _client: PostHog | null = null;

export function getPostHogClient() {
  if (!_client) {
    _client = new posthog.PostHog(PUBLIC_POSTHOG_KEY, {
      host: PUBLIC_POSTHOG_HOST,
    });
  }
  return _client;
}
--------------------------------------------------

==============================
FILE: Svelte Config (e.g svelte.config.js)
LOCATION: Wherever the root of the app is
==============================
Changes:
- Set config to not use relative asset paths

Example:
--------------------------------------------------
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
    // ...
    paths: {
        relative: false, // Required for PostHog session replay to work correctly
    },
    // ...
	}
};

export default config;

--------------------------------------------------`;
};
