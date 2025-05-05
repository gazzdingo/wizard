export const getReactDocumentation = ({
  language,
  envVarPrefix,
}: {
  language: 'typescript' | 'javascript';
  envVarPrefix: string;
}) => {
  const clientKeyText =
    envVarPrefix === 'VITE_PUBLIC_'
      ? 'import.meta.env.VITE_PUBLIC_GROWTHBOOK_CLIENT_KEY'
      : `process.env.${envVarPrefix}GROWTHBOOK_CLIENT_KEY`;

  const hostText =
    envVarPrefix === 'VITE_PUBLIC_'
      ? 'import.meta.env.VITE_PUBLIC_GROWTHBOOK_API_HOST'
      : `process.env.${envVarPrefix}GROWTHBOOK_API_HOST`;

  const tsx = language === 'typescript';

  return `
==============================
FILE: {index / App}.${tsx ? 'tsx' : 'jsx'} (wherever the root of the app is)
LOCATION: Wherever the root of the app is
==============================
Changes:
- Initialize GrowthBook and wrap the application root with GrowthBookProvider.
- Uses ${envVarPrefix}GROWTHBOOK_CLIENT_KEY and ${envVarPrefix}GROWTHBOOK_API_HOST environment variables.

Example:
--------------------------------------------------
import React, { useEffect } from "react";
import { GrowthBook, GrowthBookProvider } from "@growthbook/growthbook-react";

// Create a GrowthBook instance
const gb = new GrowthBook({
  apiHost: ${hostText},
  clientKey: ${clientKeyText},
  // enableDevMode: process.env.NODE_ENV === 'development',
  // Optional: Called every time a user is put into an experiment
  // trackingCallback: (experiment, result) => {
  //   console.log("Experiment Viewed", {
  //     experimentId: experiment.key,
  //     variationId: result.key,
  //   });
  // },
});

export default function App() {
  useEffect(() => {
    // Load features asynchronously
    gb.loadFeatures();

    // Optional: Set user attributes for targeting (e.g., from auth state)
    // gb.setAttributes({
    //   id: "user-123",
    //   company: "acme-inc",
    //   // ... other attributes
    // });
  }, []); // Empty dependency array: load features once on mount

  return (
    <GrowthBookProvider growthbook={gb}>
      {/* Your application components */}
      {/* <OtherComponent /> */}
    </GrowthBookProvider>
  );
}
--------------------------------------------------`;
};
