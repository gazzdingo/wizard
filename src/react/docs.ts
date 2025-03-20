import { getUiHostFromHost } from './utils';

export const getReactDocs = ({
  host,
  language,
}: {
  host: string;
  language: 'typescript' | 'javascript';
}) => {
  return `
==============================
FILE: {index / App}.${language === 'typescript' ? 'tsx' : 'jsx'
    } (or wherever the app root might be located)
LOCATION: Wherever the root of the app is likely to be located
==============================
Changes:
- Import the PostHogProvider from posthog-js/react
- Wrap the app in the PostHogProvider
Example:
--------------------------------------------------
import { PostHogProvider} from 'posthog-js/react'

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <PostHogProvider
      apiKey={process.env.REACT_APP_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: ${host},
        ui_host: "${getUiHostFromHost(host)}",
      }}
    >
      <App />
    </PostHogProvider>
  </React.StrictMode>
);`
};