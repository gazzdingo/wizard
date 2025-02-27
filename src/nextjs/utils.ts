import { major, minVersion } from 'semver';
import { abortIfCancelled } from '../utils/clack-utils';
import clack from '../utils/clack';

export function getNextJsVersionBucket(version: string | undefined) {
  if (!version) {
    return 'none';
  }

  try {
    const minVer = minVersion(version);
    if (!minVer) {
      return 'invalid';
    }
    const majorVersion = major(minVer);
    if (majorVersion >= 11) {
      return `${majorVersion}.x`;
    }
    return '<11.0.0';
  } catch {
    return 'unknown';
  }
}

export enum NextJsRouter {
  APP_ROUTER = 'app-router',
  PAGES_ROUTER = 'pages-router',
}

export async function getNextJsRouter(allFiles: string[]): Promise<NextJsRouter> {

  const hasPagesDir = allFiles.some((file) => file.includes('_app.tsx'));
  const hasAppDir = allFiles.some((file) => file.includes('app/layout.*'));
  if (hasPagesDir && !hasAppDir) {
    clack.log.info('Detected Pages Router 📃');
    return NextJsRouter.PAGES_ROUTER;
  }
  if (hasAppDir && !hasPagesDir) {
    clack.log.info('Detected App Router 📱');
    return NextJsRouter.APP_ROUTER;
  }


  const result: NextJsRouter = await abortIfCancelled(clack.select({
    message: 'What router are you using?',
    options: [
      { label: 'App Router', value: NextJsRouter.APP_ROUTER },
      { label: 'Pages Router', value: NextJsRouter.PAGES_ROUTER },
    ],
  }))

  return result;
}


