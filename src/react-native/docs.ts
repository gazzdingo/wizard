export const getReactNativeDocumentation = ({
  language,
  host,
  projectApiKey,
}: {
  language: 'typescript' | 'javascript';
  host: string;
  projectApiKey: string;
}) => {
  return `
==============================
FILE: Modify the entrypoint for the app code
LOCATION: Usually app/_layout.${
    language === 'typescript' ? 'tsx' : 'jsx'
  }, app/index.${language === 'typescript' ? 'ts' : 'js'}, App.${
    language === 'typescript' ? 'tsx' : 'jsx'
  } or something similar. There is only one entrypoint file, so you should edit the existing one.
==============================
Changes:
- Add the PostHogProvider to the root of the app in the provider tree. If other providers are already present, add it in a suitable location.

Example (with the correct API key and host):
--------------------------------------------------
import { PostHogProvider } from 'posthog-react-native'
...

export function MyApp() {
    return (
        <PostHogProvider apiKey="${projectApiKey}" options={{
            host: '${host}', 
            enableSessionReplay: true,
        }} autocapture>
         ...
        </PostHogProvider>
    )
}
--------------------------------------------------`;
};
