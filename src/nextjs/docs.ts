import { getAssetHostFromHost } from './utils';

export const getNextjsAppRouterDocs = ({
  host,
  language,
}: {
  host: string;
  language: 'typescript' | 'javascript';
}) => {
  return `
==============================
FILE: app/components/PostHogProvider.${
    language === 'typescript' ? 'tsx' : 'jsx'
  }
==============================
Changes:
- Create a PostHogProvider component that will be imported into the layout file.

Example:
--------------------------------------------------
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from "next/navigation"

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: "/ingest",
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      capture_pageview: false, // We capture pageviews manually
      capture_pageleave: true, // Enable pageleave capture
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PHProvider>
  )
}


function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname
      const search = searchParams.toString()
      if (search) {
        url += "?" + search
      }
      posthog.capture('$pageview', { '$current_url': url })
    }
  }, [pathname, searchParams, posthog])

  return null
}

function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  )
}
--------------------------------------------------

==============================
FILE: app/layout.${language === 'typescript' ? 'tsx' : 'jsx'}
==============================
Changes:
- Import the PostHogProvider from the providers file and wrap the app in it.

Example:
--------------------------------------------------
// other imports
import { PostHogProvider } from './components/providers'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>
          {/* other providers */}
          {children}
          {/* other providers */}
        </PostHogProvider>
      </body>
    </html>
  )
}
--------------------------------------------------

==============================
FILE: app/lib/server/posthog.${language === 'typescript' ? 'ts' : 'js'}
==============================
Changes:
- Initialize the PostHog Node.js client

Example:
--------------------------------------------------
import { PostHog } from 'posthog-node'

export default function PostHogClient() {
  const posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
  return posthogClient
}
--------------------------------------------------

==============================
FILE: next.config.{js,ts,mjs,cjs}
==============================
Changes:
- Add rewrites to the Next.js config to support PostHog, if there are existing rewrites, add the PostHog rewrites to them.
- Add skipTrailingSlashRedirect to the Next.js config to support PostHog trailing slash API requests.
- This can be of type js, ts, mjs, cjs etc. You should adapt the file according
Example:
--------------------------------------------------
const nextConfig = {
  // other config
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "${getAssetHostFromHost(host)}/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "${host}/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "${host}/decide",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
}
module.exports = nextConfig
--------------------------------------------------`;
};

export const getNextjsPagesRouterDocs = ({
  host,
  language,
}: {
  host: string;
  language: 'typescript' | 'javascript';
}) => {
  return `
==============================
FILE: pages/_app.${language === 'typescript' ? 'tsx' : 'jsx'}
==============================
Changes:
- Initialize PostHog in _app.js.
- Wrap the application in PostHogProvider.
- Manually capture $pageview events.

Example:
--------------------------------------------------
import { useEffect } from 'react'
import { Router } from 'next/router'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') posthog.debug()
      },
    })

    const handleRouteChange = () => posthog?.capture('$pageview')
    Router.events.on('routeChangeComplete', handleRouteChange)

    return () => {
      Router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  return (
    <PostHogProvider client={posthog}>
      <Component {...pageProps} />
    </PostHogProvider>
  )
}
--------------------------------------------------

==============================
FILE: src/lib/server/posthog.${language === 'typescript' ? 'ts' : 'js'}
==============================
Changes:
- Initialize the PostHog Node.js client for server-side tracking.

Example:
--------------------------------------------------
import { PostHog } from 'posthog-node'

export default function PostHogClient() {
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
}
--------------------------------------------------

==============================
FILE: next.config.{js,ts,mjs,cjs}
==============================
Changes:
- Add rewrites to support PostHog tracking.
- Enable support for PostHog API trailing slash requests.

Example:
--------------------------------------------------
const nextConfig = {
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "${getAssetHostFromHost(
        host,
      )}/static/:path*" },
      { source: "/ingest/:path*", destination: "${host}/:path*" },
      { source: "/ingest/decide", destination: "${host}/decide" },
    ]
  },
  skipTrailingSlashRedirect: true,
}

module.exports = nextConfig
--------------------------------------------------
`;
};
