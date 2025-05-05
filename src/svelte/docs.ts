export const getSvelteDocumentation = ({
  language,
}: {
  language: 'typescript' | 'javascript';
}) => {
  const ts = language === 'typescript';
  return `
==============================
FILE: routes/+layout.${ts ? 'ts' : 'js'}
LOCATION: Root of the application routes
==============================
Changes:
- Initialize GrowthBook instance on the server or universal load function.
- Fetch features and pass the instance to the page data.
- Uses PUBLIC_GROWTHBOOK_CLIENT_KEY and PUBLIC_GROWTHBOOK_API_HOST environment variables.
Example:
--------------------------------------------------
import { GrowthBook } from "@growthbook/growthbook-svelte";
import { PUBLIC_GROWTHBOOK_CLIENT_KEY, PUBLIC_GROWTHBOOK_API_HOST } from "$env/static/public";
${ts ? "import type { LayoutLoad } from './$types';\n" : ''}
// Create a GrowthBook instance
// IMPORTANT: Create instance outside load() if using SSR to avoid memory leaks,
// or ensure proper instance management based on your SvelteKit setup.
const gb = new GrowthBook({
  apiHost: PUBLIC_GROWTHBOOK_API_HOST,
  clientKey: PUBLIC_GROWTHBOOK_CLIENT_KEY,
  // enableDevMode: process.env.NODE_ENV === 'development',
  // trackingCallback: (experiment, result) => { /* Track experiment */ },
});

export const load${ts ? ': LayoutLoad' : ''} = async () => {
  // Load features async
  await gb.loadFeatures();

  // Optional: Set attributes from server/request if needed
  // gb.setAttributes({ ... });

  return {
    growthbook: gb, // Pass the instance to page data
  };
};
--------------------------------------------------

==============================
FILE: routes/+layout.svelte
LOCATION: Root of the application routes
==============================
Changes:
- Get GrowthBook instance from page data.
- Set the GrowthBook instance in Svelte context.
- Remove PostHog pageview tracking logic.

Example:
--------------------------------------------------
<script${ts ? ' lang="ts"' : ''}>
  import { setContext } from 'svelte';
  import { GROWTHBOOK_KEY } from '@growthbook/growthbook-svelte'; // Key for context
${
  ts
    ? "  import type { LayoutData } from './$types';\n\n  export let data: LayoutData;\n"
    : '  export let data;'
}
  // Get the GrowthBook instance passed from load function
  const growthbook = data.growthbook;

  // Set the instance in context so components can use it
  setContext(GROWTHBOOK_KEY, growthbook);

  // --- Removed PostHog pageview tracking logic --- 
  // import { browser } from '$app/environment';
  // import { beforeNavigate, afterNavigate } from '$app/navigation';
  // import posthog from 'posthog-js'
  // 
  // if (browser) {
  //   beforeNavigate(() => posthog.capture('$pageleave'));
  //   afterNavigate(() => posthog.capture('$pageview'));
  // }
  // --------------------------------------------

  // Note: GrowthBook does not track pageviews automatically.
  // Implement manual pageview tracking if needed.
</script>

<slot />
--------------------------------------------------

==============================
FILE: src/routes/some-page/+page.svelte (Example Usage)
LOCATION: Any component/page that needs feature flags/experiments
==============================
Changes:
- Show example of using the <Feature> component or 'feature' store.

Example using <Feature> component:
--------------------------------------------------
<script${ts ? ' lang="ts"' : ''}>
  import { Feature } from '@growthbook/growthbook-svelte';
</script>

<h1>My Page</h1>

<Feature id="new-signup-flow">
  <p>Showing the new signup flow!</p>
  <svelte:fragment slot="fallback">
    <p>Showing the old signup flow.</p>
  </svelte:fragment>
</Feature>

Example using 'feature' store:
--------------------------------------------------
<script${ts ? ' lang="ts"' : ''}>
  import { feature } from '@growthbook/growthbook-svelte';

  const newSignupFlowEnabled = feature('new-signup-flow');
</script>

<h1>My Page</h1>

{#if $newSignupFlowEnabled}
  <p>Showing the new signup flow!</p>
{:else}
  <p>Showing the old signup flow.</p>
{/if}
--------------------------------------------------`;
  // Note: Removed PostHog server client setup and svelte.config.js changes.
};
