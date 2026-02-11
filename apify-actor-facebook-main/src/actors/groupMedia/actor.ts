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
import type { FbGroupMediaActorInput } from './config';
import type { FbGroupMediaRouteLabel } from './types';
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

/** Find first route whose match(url) returns true; return its handlerLabel so crawlee-one can dispatch */
function getLabelForUrl(url: string): FbGroupMediaRouteLabel | null {
  for (const route of routes) {
    try {
      if (route.match(url)) return route.handlerLabel as FbGroupMediaRouteLabel;
    } catch {
      // invalid URL or match error
    }
  }
  return null;
}

/** Transform startUrls into request-shaped items with userData.label so crawlee-one's own startUrls processing uses labels */
function transformStartUrlsToLabeledRequests(
  startUrls: FbGroupMediaActorInput['startUrls']
): Array<{ url: string; userData: { label?: string } }> {
  if (!startUrls || !Array.isArray(startUrls)) return [];
  return startUrls
    .map((item) => {
      const url = typeof item === 'string' ? item : (item as { url: string })?.url;
      if (!url) return null;
      const label = getLabelForUrl(url);
      return { url, userData: { label: label ?? undefined } };
    })
    .filter((r): r is { url: string; userData: { label?: string } } => r != null);
}

/** Open default request queue, add labeled requests from transformed startUrls, return the queue */
async function seedRequestQueueFromStartUrls(
  transformedInput: FbGroupMediaActorInput | null
): Promise<Awaited<ReturnType<typeof Actor.openRequestQueue>> | null> {
  const startUrls = transformedInput?.startUrls;
  const reqQueue = await Actor.openRequestQueue();
  const requests = transformStartUrlsToLabeledRequests(startUrls);
  if (requests.length === 0) {
    console.log('[seedRequestQueue] No startUrls in input — queue may be empty');
    return reqQueue;
  }
  await reqQueue.addRequests(requests);
  console.log(`[seedRequestQueue] Added ${requests.length} start URL(s) with route labels to the request queue`);
  return reqQueue;
}

export const run = async (crawlerConfigOverrides?: PlaywrightCrawlerOptions): Promise<void> => {
  const pkgJson = getPackageJsonInfo(module, ['name']);

  // 1. Get raw input and transform startUrls to [{ url, userData: { label } }] BEFORE runCrawleeOne
  const rawInput = (await Actor.getInput()) as FbGroupMediaActorInput | null;
  const labeledStartUrls = transformStartUrlsToLabeledRequests(rawInput?.startUrls);
  const transformedInput: FbGroupMediaActorInput | null = rawInput
    ? { ...rawInput, startUrls: labeledStartUrls.length > 0 ? labeledStartUrls : rawInput.startUrls }
    : null;

  // 2. Override Actor.getInput so crawlee-one's internal startUrls processing sees labeled requests
  const originalGetInput = Actor.getInput.bind(Actor);
  Actor.getInput = async () => transformedInput;

  try {
    const requestQueue = await seedRequestQueueFromStartUrls(transformedInput);

    await runCrawleeOne<'playwright', FbGroupMediaRouteLabel, FbGroupMediaActorInput>({
      actorType: 'playwright',
      actorName: pkgJson.name,
      actorConfig: {
        validateInput,
        routes,
        routeHandlers: ({ input }) => createHandlers(input),
        routeHandlerWrappers: ({ input }) => [
          closePopupsRouterWrapper,
        ],
      },
      crawlerConfigDefaults: {
        ...crawlerConfigDefaults,
        ...(requestQueue ? { requestQueue } : {}),
      },
      crawlerConfigOverrides,
      onActorReady: async (actor) => {
        await actor.runCrawler();
      },
    });
  } catch (err) {
    console.log(err);
    throw err;
  } finally {
    Actor.getInput = originalGetInput;
  }
};
