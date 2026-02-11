// Patch @apify/log to accept any level
const OriginalLog = require('@apify/log');
const originalConstructor = OriginalLog.prototype.constructor;
OriginalLog.prototype.constructor = function (options: any = {}) {
  if (options.level !== undefined && typeof options.level !== 'number') {
    options.level = 4; // Force INFO level
  }
  return originalConstructor.call(this, options);
};

import type { PlaywrightCrawlerOptions } from 'crawlee';
import { runCrawleeOne, logLevelHandlerWrapper } from 'crawlee-one';
import { Actor } from 'apify';

import { createHandlers, routes } from './router';
import { validateInput } from './validation';
import { getPackageJsonInfo } from '../../utils/package';
import type { FbGroupMediaRouteLabel } from './types';
import type { FbGroupMediaActorInput } from './config';
import { closePopupsRouterWrapper } from './pageActions/general';

const FACEBOOK_DOMAIN = '.facebook.com';
const FACEBOOK_PATH = '/';

/** Parse "name1=value1; name2=value2" into Playwright cookie format for Facebook */
function parseCookieString(cookieString: string): { name: string; value: string; domain: string; path: string }[] {
  if (!cookieString || typeof cookieString !== 'string') return [];
  return cookieString
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq).trim();
      const value = eq === -1 ? '' : pair.slice(eq + 1).trim();
      return {
        name,
        value,
        domain: FACEBOOK_DOMAIN,
        path: FACEBOOK_PATH,
      };
    })
    .filter((c) => c.name);
}

/** Injects Facebook cookies from actor input into the browser context before navigation */
async function injectCookiesPreNav({
  page,
  request,
}: {
  page: { context: () => { addCookies: (c: unknown[]) => Promise<void> } };
  request: { url: string };
}) {
  const url = request?.url ?? '';
  if (!url.includes('facebook.com')) return;
  const input = (await Actor.getInput()) as FbGroupMediaActorInput | null;
  const raw = input?.cookies ?? null;
  if (!raw) {
    console.log('[injectCookiesPreNav] No cookies in input — skipping');
    return;
  }
  const cookies = parseCookieString(raw);
  if (cookies.length === 0) {
    console.log('[injectCookiesPreNav] Parsed 0 cookies — check format (name1=val1; name2=val2)');
    return;
  }
  await page.context().addCookies(cookies);
  console.log(`[injectCookiesPreNav] Injected ${cookies.length} cookies for ${url}`);
}

/** Crawler options that **may** be overriden by user input */
const crawlerConfigDefaults: PlaywrightCrawlerOptions = {
  maxRequestsPerMinute: 120,
  requestHandlerTimeoutSecs: 60 * 60 * 24,
  headless: true,
  preNavigationHooks: [injectCookiesPreNav],
};

/** Ensure startUrls from input are in the request queue before crawler runs (crawlee-one may not seed the queue) */
async function seedRequestQueueFromStartUrls(): Promise<void> {
  const input = (await Actor.getInput()) as FbGroupMediaActorInput | null;
  const startUrls = input?.startUrls;
  if (!startUrls || !Array.isArray(startUrls) || startUrls.length === 0) {
    console.log('[seedRequestQueue] No startUrls in input — queue may be empty');
    return;
  }
  const reqQueue = await Actor.openRequestQueue();
  const requests = startUrls.map((item) => {
    const url = typeof item === 'string' ? item : (item as { url: string })?.url;
    return url ? { url } : null;
  }).filter(Boolean) as { url: string }[];
  if (requests.length === 0) {
    console.log('[seedRequestQueue] startUrls had no valid URLs');
    return;
  }
  await reqQueue.addRequests(requests);
  console.log(`[seedRequestQueue] Added ${requests.length} start URL(s) to the request queue`);
}

export const run = async (crawlerConfigOverrides?: PlaywrightCrawlerOptions): Promise<void> => {
  const pkgJson = getPackageJsonInfo(module, ['name']);

  await runCrawleeOne<'playwright', FbGroupMediaRouteLabel, FbGroupMediaActorInput>({
    actorType: 'playwright',
    actorName: pkgJson.name,
    actorConfig: {
      validateInput,
      routes,
      routeHandlers: ({ input }) => createHandlers(input),
      routeHandlerWrappers: ({ input }) => [
        // logLevelHandlerWrapper('info'),
        closePopupsRouterWrapper,
      ],
    },
    crawlerConfigDefaults,
    crawlerConfigOverrides,
    onActorReady: async (actor) => {
      await seedRequestQueueFromStartUrls();
      await actor.runCrawler();
    },
  }).catch((err) => {
    console.log(err);
    throw err;
  });
};
