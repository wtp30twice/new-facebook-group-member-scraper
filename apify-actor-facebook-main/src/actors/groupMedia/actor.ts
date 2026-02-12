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
import type { CrawleeOneRouteWrapper } from 'crawlee-one';
import { runCrawleeOne } from 'crawlee-one';
import { Actor } from 'apify';

import { createHandlers, routes } from './router';
import { validateInput } from './validation';
import { getPackageJsonInfo } from '../../utils/package';
import type { FbGroupMediaRouteLabel } from './types';
import type { FbGroupMediaRouterContext } from './types';
import type { FbGroupMediaActorInput } from './config';
import { closePopupsRouterWrapper } from './pageActions/general';
import type { PlaywrightCrawlingContext } from 'crawlee';

const FACEBOOK_DOMAIN = '.facebook.com';
const FACEBOOK_PATH = '/';

const QUEUE_NAME = 'my-facebook-queue';

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
  if (!raw) return;
  const cookies = parseCookieString(raw);
  if (cookies.length === 0) return;
  await page.context().addCookies(cookies);
}

const crawlerConfigDefaults: PlaywrightCrawlerOptions = {
  maxRequestsPerMinute: 120,
  requestHandlerTimeoutSecs: 60 * 60 * 24,
  headless: true,
  preNavigationHooks: [injectCookiesPreNav],
};

/** Return handlerLabel for URL so requests get the correct route label (crawlee-one dispatches by userData.label). */
function getLabelForUrl(url: string): FbGroupMediaRouteLabel | null {
  for (const route of routes) {
    try {
      if (route.match(url)) return route.handlerLabel as FbGroupMediaRouteLabel;
    } catch {
      // invalid URL
    }
  }
  return null;
}

/** DEBUG: Log request url + userData.label and confirm requestHandler is firing. */
const debugRouteHandlerWrapper: CrawleeOneRouteWrapper<
  PlaywrightCrawlingContext<any>,
  FbGroupMediaRouterContext
> = (origRouterHandler) => {
  return (ctx, ...args) => {
    const req = ctx.request as { url: string; userData?: { label?: string } };
    const label = req?.userData?.label ?? '(no label)';
    console.log('[DEBUG] requestHandler firing — url:', req?.url, 'userData.label:', label);
    return origRouterHandler(ctx, ...args);
  };
};

export const run = async (crawlerConfigOverrides?: PlaywrightCrawlerOptions): Promise<void> => {
  const pkgJson = getPackageJsonInfo(module, ['name']);

  const rawInput = (await Actor.getInput()) as FbGroupMediaActorInput | null;
  const startUrls = rawInput?.startUrls ?? [];
  const labeledRequests = startUrls
    .map((item: string | { url?: string }) => {
      const raw = typeof item === 'string' ? item : item?.url;
      const url = typeof raw === 'string' ? raw.trim() : '';
      if (!url) return null;
      const label = getLabelForUrl(url);
      if (!label) {
        console.log('[DEBUG] No route match for url:', url);
        return null;
      }
      return { url, userData: { label } };
    })
    .filter((r): r is { url: string; userData: { label: string } } => r != null);

  const emptyInput: FbGroupMediaActorInput | null = rawInput ? { ...rawInput, startUrls: [] } : null;
  const originalGetInput = Actor.getInput.bind(Actor);
  Actor.getInput = async () => emptyInput;

  const requestQueue = await Actor.openRequestQueue(QUEUE_NAME);
  if (labeledRequests.length > 0) {
    await requestQueue.addRequests(labeledRequests);
    console.log('[DEBUG] Seeded queue with', labeledRequests.length, 'labeled request(s). First:', labeledRequests[0]?.url, 'label:', labeledRequests[0]?.userData?.label);
  }

  try {
    await runCrawleeOne<'playwright', FbGroupMediaRouteLabel, FbGroupMediaActorInput>({
      actorType: 'playwright',
      actorName: pkgJson.name,
      actorConfig: {
        validateInput,
        routes,
        routeHandlers: ({ input }) => createHandlers(input),
        routeHandlerWrappers: [debugRouteHandlerWrapper, closePopupsRouterWrapper],
      },
      crawlerConfigDefaults: {
        ...crawlerConfigDefaults,
        requestQueue,
      },
      crawlerConfigOverrides: {
        ...crawlerConfigOverrides,
        requestQueue,
      },
      onActorReady: async (actor) => {
        console.log('[DEBUG] onActorReady — starting runCrawler (queue should have', labeledRequests.length, 'request(s))');
        await actor.runCrawler();
      },
    });
  } finally {
    Actor.getInput = originalGetInput;
  }
};
