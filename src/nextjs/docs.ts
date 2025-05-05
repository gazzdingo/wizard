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
"use client";

import { GrowthBook, GrowthBookProvider } from "@growthbook/growthbook-react";
import { useEffect } from "react";

// Create a GrowthBook instance
const gb = new GrowthBook({
  apiHost: process.env.NEXT_PUBLIC_GROWTHBOOK_API_HOST,
  clientKey: process.env.NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY,
  // Optional: Set attributes, features, tracking callback, etc.
  // attributes: { id: "user-123" },
  // enableDevMode: process.env.NODE_ENV === "development",
  // trackingCallback: (experiment, result) => {
  //   console.log("Viewed Experiment", {
  //     experimentId: experiment.key,
  //     variationId: result.key,
  //   });
  // },
});

export function GrowthBookProviderWrapper({ children }${
    tsx ? ': { children: React.ReactNode }' : ''
  }) {
  useEffect(() => {
    // Load features asynchronously
    gb.loadFeatures();

    // Optional: Refresh features periodically or based on events
    // const interval = setInterval(() => gb.refreshFeatures(), 60000); // Refresh every minute
    // return () => clearInterval(interval);
  }, []);

  return <GrowthBookProvider growthbook={gb}>{children}</GrowthBookProvider>;
}

// Note: GrowthBook does not automatically track pageviews like some other tools.
// You would need to implement pageview tracking manually if required,
// potentially using a trackingCallback or analytics integration.
--------------------------------------------------

==============================
FILE: layout.${tsx ? 'tsx' : 'jsx'}
LOCATION: Wherever the root layout is
==============================
Changes:
- Import the GrowthBookProviderWrapper and wrap the main content.

Example:
--------------------------------------------------
// other imports
import { GrowthBookProviderWrapper } from "LOCATION_OF_GROWTHBOOK_PROVIDER_WRAPPER";

export default function RootLayout({ children }${
    tsx ? ': { children: React.ReactNode }' : ''
  }) {
  return (
    <html lang="en">
      <body>
        <GrowthBookProviderWrapper>
          {/* other providers */}
          {children}
          {/* other providers */}
        </GrowthBookProviderWrapper>
      </body>
    </html>
  );
}
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
import { useEffect } from "react";
import { GrowthBook, GrowthBookProvider } from "@growthbook/growthbook-react";
// Remove Router import if not used elsewhere
// import { Router } from "next/router";

// Create a GrowthBook instance (outside the component ensures it's created once)
const gb = new GrowthBook({
  apiHost: process.env.NEXT_PUBLIC_GROWTHBOOK_API_HOST,
  clientKey: process.env.NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY,
  // Optional: Set attributes, enableDevMode, trackingCallback, etc.
  // enableDevMode: process.env.NODE_ENV === "development",
  // trackingCallback: (experiment, result) => { /* Track experiment */ },
});

export default function App({ Component, pageProps }${
    tsx ? ': { Component: any, pageProps: any }' : ''
  }) {
  useEffect(() => {
    // Load features asynchronously when the app mounts
    gb.loadFeatures();

    // Optional: Set user attributes when they change
    // For example, if user logs in:
    // gb.setAttributes({ ...gb.getAttributes(), id: userId, loggedIn: true });

    // Note: GrowthBook doesn't track pageviews automatically.
    // Implement manual pageview tracking here if needed, potentially using Router events.

  }, []);

  return (
    <GrowthBookProvider growthbook={gb}>
      <Component {...pageProps} />
    </GrowthBookProvider>
  );
}
--------------------------------------------------`;
};
