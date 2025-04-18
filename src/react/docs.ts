export const getReactDocumentation = ({
  language,
  envVarPrefix,
}: {
  language: 'typescript' | 'javascript';
  envVarPrefix: string;
}) => {
  const apiKeyText =
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
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { PostHogProvider} from 'posthog-js/react'

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <PostHogProvider
      apiKey={${apiKeyText}}
      options={{
        api_host: ${hostText},
        debug: ${
          envVarPrefix === 'VITE_PUBLIC_'
            ? 'import.meta.env.MODE === "development"'
            : 'process.env.NODE_ENV === "development"'
        },
      }}
    >
      <App />
    </PostHogProvider>
  </React.StrictMode>
--------------------------------------------------`;
};
