export const getReactDocumentation = ({
  language,
  envVarPrefix,
}: {
  language: 'typescript' | 'javascript';
  envVarPrefix: string;
}) => {
  const clientKeyText =
    envVarPrefix === 'VITE_PUBLIC_'
      ? 'import.meta.env.VITE_PUBLIC_POSTHOG_KEY'
      : `process.env.${envVarPrefix}POSTHOG_KEY`;

  const hostText =
    envVarPrefix === 'VITE_PUBLIC_'
      ? 'import.meta.env.VITE_PUBLIC_POSTHOG_HOST'
      : `process.env.${envVarPrefix}POSTHOG_HOST`;

  return `
==============================
FILE: {index / App}.${
    language === 'typescript' ? 'tsx' : 'jsx'
  } (wherever the root of the app is)
LOCATION: Wherever the root of the app is
==============================
Changes:
- Add the PostHogProvider to the root of the app in the provider tree.

Example:
--------------------------------------------------
import { useEffect } from "react";
import { GrowthBook, GrowthBookProvider } from "@growthbook/growthbook-react";

// Create a GrowthBook instance
const gb = new GrowthBook({
  apiHost: ${hostText},
  clientKey: ${clientKeyText},
  enableDevMode: true,
  // Only required for A/B testing
  // Called every time a user is put into an experiment
  trackingCallback: (experiment, result) => {
    console.log("Experiment Viewed", {
      experimentId: experiment.key,
      variationId: result.key,
    });
  },
});
gb.init({
  // Optional, enable streaming updates
  streaming: true
})

export default function App() {
  useEffect(() => {
    // Set user attributes for targeting (from cookie, auth system, etc.)
    gb.setAttributes({
      id: user.id,
      company: user.company,
    });
  }, [user])

  return (
    <GrowthBookProvider growthbook={gb}>
      <OtherComponent />
    </GrowthBookProvider>
  );
}
--------------------------------------------------`;
};
