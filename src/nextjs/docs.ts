export const getNextjsAppRouterDocs = ({
  language,
}: {
  language: 'typescript' | 'javascript';
}) => {
  const tsx = language === 'typescript';
  return `
==============================
FILE: GrowthBookProviderWrapper.${tsx ? 'tsx' : 'jsx'}
LOCATION: Wherever other providers are, or in a client components folder
==============================
Changes:
- Create a GrowthBookProviderWrapper component to initialize GrowthBook and wrap the application.
- Fetches features on the client side.
- Uses NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY and NEXT_PUBLIC_GROWTHBOOK_API_HOST environment variables.

Example:
--------------------------------------------------
Create the file .env.local in your Next.js app if it doesn't exist yet and add this info there:

NEXT_PUBLIC_GROWTHBOOK_API_HOST=https://cdn.growthbook.io
NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY= {your-client-key}
# Below is only required if you enabled encryption
NEXT_PUBLIC_GROWTHBOOK_DECRYPTION_KEY= {your-decryption-key}


Our Javascript SDK works out-of-the-box with React Server Components, but we can more deeply integrate it with Next.js by creating a small helper function in app/growthbookServer.ts with the following contents:

// app/growthbookServer.ts
import { setPolyfills, configureCache } from "@growthbook/growthbook";

export function configureServerSideGrowthBook() {
  // Tag fetch requests so they can be revalidated on demand
  setPolyfills({
    fetch: (url: string, init: RequestInit) =>
      fetch(url, {
        ...init,
        next: {
          // Cache feature definitions for 10 seconds for dev
          // In prod, use a higher value and use WebHooks to revalidate on-demand
          revalidate: 10,
          tags: ["growthbook"],
        },
      }),
  });

  // Disable the built-in cache since we're using Next.js's fetch cache instead
  configureCache({
    disableCache: true,
  });
}

Now, let's modify our main app/page.tsx file.

Change the top of the file to match the following:

import Image from "next/image";
import { configureServerSideGrowthBook } from "./growthbookServer";
import { GrowthBook } from "@growthbook/growthbook";

export default async function Home() {
  configureServerSideGrowthBook();

  // Create and initialize a GrowthBook instance
  const gb = new GrowthBook({
    apiHost: process.env.NEXT_PUBLIC_GROWTHBOOK_API_HOST,
    clientKey: process.env.NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY,
    decryptionKey: process.env.NEXT_PUBLIC_GROWTHBOOK_DECRYPTION_KEY,
  });
  await gb.init({ timeout: 1000 });

  // Set targeting attributes for the user
  // TODO: get from cookies/headers/db
  await gb.setAttributes({
    id: "123",
    employee: true,
  });

  // Evaluate a feature flag
  const welcomeMessage = gb.isOn("welcome-message");

  // Cleanup
  gb.destroy();

Next Steps And now let's use the feature flag we referenced above. Add the following somewhere on the page so we can see it:

<h2>Welcome Message: {welcomeMessage ? "ON" : "OFF"}</h2>

This will render as OFF for now.

6. Turn on for your Team
In our page, we hard-coded employee: true when setting our targeting attributes. Let's use that to turn on the feature for just employees.

Create a Force Rule for your feature:

GrowthBook Targeting Rule
Publish the draft and refresh your Next.js app and you should now see the welcome message showing up as ON! (Note: it might take a few seconds for the cache to refresh).

If you change your targeting attribute to employee: false in the page, you should see the welcome message switch back to OFF immediately.

The best part about targeting attributes in GrowthBook is that they are evaluated entirely locally. Sensitive user data is never sent over the network and there is no performance penalty. Some other libraries require an HTTP request to evaluate a feature for a user and this is often a deal breaker for performance.

7. Gradually roll out to your users
After you test the new feature within your team, you probably want to start rolling it out to real users.

We can do that with another rule in GrowthBook:

GrowthBook Rollout Rule
In the targeting attributes, make sure you set employee: false. That will ensure you skip the first rule we made and fall into the second rollout rule.

note
The GrowthBook SDK uses deterministic hashing to figure out whether or not someone is included in a rollout (or A/B test). The SDKs hash together the selected targeting attribute (id) and the feature key (welcome-message) and coverts it to a float between 0 and 1. If that float is less than or equal to the rollout percent, the user is included. This ensures a consistent UX and prevents one user from constantly switching between ON and OFF as they navigate your app.

Try changing the id in the targeting attributes to a few different random strings and see what happens. You should notice about half of the time the welcome message will be ON.

Conclusion and Next Steps
We showed here how to do a targeted rule, and how to do a rollout rule. It's also just as easy to make an A/B test in the same manner. You will need to set up event tracking and connect GrowthBook to your data source.

We support many different rendering strategies in Next.js, not just server components. Check out our example Next.js app, which demonstrates static rendering, client components, streaming server components, and more.

Once you do the initial integration work, it only takes a few seconds to wrap your code in feature flags. Once you realize how easy and stress-free deploys and experimentation can be, there's no going back.
--------------------------------------------------`;
};

export const getNextjsPagesRouterDocs = ({
  language,
}: {
  language: 'typescript' | 'javascript';
}) => {
  const tsx = language === 'typescript';
  return `
==============================
FILE: _app.${tsx ? 'tsx' : 'jsx'}
LOCATION: Wherever the root _app.${tsx ? 'tsx' : 'jsx'} file is
==============================
Changes:
- Initialize GrowthBook client-side.
- Wrap the application in GrowthBookProvider.
- Uses NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY and NEXT_PUBLIC_GROWTHBOOK_API_HOST environment variables.

Example:
--------------------------------------------------
GrowthBook will generate some integration code for you, including a unique SDK Client Key to load your features from.

GrowthBook Integration Code
Create the file .env.local if it doesn't exist yet and add your generated key there:

NEXT_PUBLIC_GROWTHBOOK_API_HOST=https://cdn.growthbook.io
NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY=
# Below is only required if you enabled encryption
NEXT_PUBLIC_GROWTHBOOK_DECRYPTION_KEY=

We first need to install the GrowthBook React SDK in our Next.js app:

yarn add @growthbook/growthbook-react

Then we can modify the generated React code to work with the Next.js framework. Modify the file pages/_app.js with the following contents:

import "../styles/globals.css";
import { GrowthBook, GrowthBookProvider } from "@growthbook/growthbook-react";
import { useEffect } from "react";

// Create a GrowthBook instance
const growthbook = new GrowthBook({
  apiHost: process.env.NEXT_PUBLIC_GROWTHBOOK_API_HOST,
  clientKey: process.env.NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY,
  decryptionKey: process.env.NEXT_PUBLIC_GROWTHBOOK_DECRYPTION_KEY,
  trackingCallback: (experiment, result) => {
    console.log("Viewed Experiment", {
      experimentId: experiment.key,
      variationId: result.key
    });
  },
});
// Start downloading feature definitions
growthbook.init();

export default function MyApp({ Component, pageProps, router }) {
  // Refresh features and targeting attributes on navigation
  useEffect(() => {
    gb.setURL(window.location.href);
    growthbook.setAttributes({
      id: "123",
      loggedIn: true,
      deviceId: "abcdef123456",
      employee: true,
      company: "acme",
      country: "US",
      browser: navigator.userAgent,
      url: router.pathname,
    });
  }, [router.pathname]);

  return (
    <GrowthBookProvider growthbook={growthbook}>
      <Component {...pageProps} />
    </GrowthBookProvider>
  );
}

In a real application, you would pull some of the targeting attributes from your authentication system or an API, but let's just leave them hard-coded for now.

4. Create a Feature in GrowthBook
Back in the GrowthBook application, we can create a new feature. For this tutorial, we'll make a simple on/off feature flag that determines whether or not we show a welcome banner on our site.

GrowthBook Create Feature
The key we chose (welcome-message) is what we will reference when using the GrowthBook SDK.

We can now edit pages/index.js and conditionally render a welcome message based on the state of the feature:

Add an import statement:

import { IfFeatureEnabled } from "@growthbook/growthbook-react";

And then put your welcome message somewhere on the page:

<IfFeatureEnabled feature="welcome-message">
  <p>I hope you enjoy this site and have a great day!</p>
</IfFeatureEnabled>

If you refresh your Next.js app, you'll notice the welcome message is not rendered. This is because when creating the feature, we set the default value to off. At this point, we could safely deploy our change to production and not worry about breaking anything.

5. Turn on the feature for your team
Now we can add rules to the feature to turn it on for specific groups of users.

In the hard-coded targeting attributes we set in pages/_app.js, we designated ourselves as an internal employee. Let's use this attribute to turn on the feature for the whole internal team:

GrowthBook Targeting Rule
Refresh your Next.js app and you should now see the welcome message appearing! (Note: it might take up to 30 seconds for the API cache to refresh).

Next.js app with feature
If you change employee to false in pages/_app.js, you should see the welcome message disappear.

The best part about targeting attributes in GrowthBook is that they are evaluated entirely locally. Sensitive user data is never sent over the network and there is no performance penalty. Some other libraries require an HTTP request to evaluate a feature for a user and this is often a deal breaker.

6. Gradually roll out to your users
After you test the new feature within your team, you probably want to start rolling it out to real users.

We can do that with another rule in GrowthBook:

GrowthBook Rollout Rule
In the targeting attributes in pages/_app.js, make sure employee is set to false. That will ensure you skip the first rule we made and fall into the second rollout rule.

note
The GrowthBook SDK uses deterministic hashing to figure out whether or not someone is included in a rollout (or A/B test). The SDKs hash together the selected targeting attribute (id) and the feature key (welcome-message) and coverts it to a float between 0 and 1. If that float is less than or equal to the rollout percent, the user is included. This ensures a consistent UX and prevents one user from constantly switching between ON and OFF as they navigate your app.

Try changing the user id in the targeting attributes in pages/_app.js to a few different random strings and see what happens. You should notice about half of the time the welcome message shows up and half of the time it doesn't.

Conclusion and Next Steps
We showed here how to do a targeted rule, and how to do a rollout rule. It's also just as easy to make an A/B test in the same manner. You will need to set up an event tracking and connect GrowthBook to your data source.

You can look at the GrowthBook React SDK docs for more ways to use feature flags in your code besides the <IfFeatureEnabled> component. Once you do the initial integration work, it only takes a few seconds to wrap your code in feature flags. Once you realize how easy and stress-free deploys and experimentation can be, there's no going back.
--------------------------------------------------`;
};
