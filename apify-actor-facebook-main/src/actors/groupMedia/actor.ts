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

export const run = async (crawlerConfigOverrides?: PlaywrightCrawlerOptions): Promise<void> => {
  const pkgJson = getPackageJsonInfo(module, ['name']);

  // NUCLEAR: Get real startUrls and build labeled requests BEFORE runCrawleeOne (crawlee-one will see empty startUrls)
  const rawInput = (await Actor.getInput()) as FbGroupMediaActorInput | null;
  const realStartUrls = rawInput?.startUrls ?? [];
  const labeledUrls = realStartUrls
    .map((item: string | { url: string }) => {
      const url = typeof item === 'string' ? item : item?.url;
      if (!url) return null;
      const label = getLabelForUrl(url);
      return { url, userData: { label: label ?? undefined } };
    })
    .filter((r): r is { url: string; userData: { label?: string } } => r != null);

  // Pass EMPTY startUrls to crawlee-one so it does nothing; we add requests ourselves in onActorReady
  const emptyInput: FbGroupMediaActorInput | null = rawInput ? { ...rawInput, startUrls: [] } : null;
  const originalGetInput = Actor.getInput.bind(Actor);
  Actor.getInput = async () => emptyInput;

  try {
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
      crawlerConfigDefaults,
      crawlerConfigOverrides,
      onActorReady: async (actor) => {
        console.log('[MANUAL QUEUE] Adding', labeledUrls.length, 'URLs with labels');
        const queue = await Actor.openRequestQueue();
        for (const req of labeledUrls) {
          console.log('[MANUAL QUEUE] Adding:', req.url, 'with label:', req.userData.label);
          await queue.addRequest(req);
        }
        console.log('[MANUAL QUEUE] Done adding URLs, starting crawler');
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
