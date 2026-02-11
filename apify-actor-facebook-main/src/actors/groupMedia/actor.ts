// Patch @apify/log to accept any level
const OriginalLog = require('@apify/log');
const originalConstructor = OriginalLog.prototype.constructor;
OriginalLog.prototype.constructor = function (options: any = {}) {
  if (options.level !== undefined && typeof options.level !== 'number') {
    options.level = 4; // Force INFO level
  }
  return originalConstructor.call(this, options);
};

import { PlaywrightCrawler } from 'crawlee';
import { Actor } from 'apify';

import type { FbGroupMediaActorInput } from './config';

const FACEBOOK_DOMAIN = '.facebook.com';
const FACEBOOK_PATH = '/';

const DEFAULT_GROUP_URL = 'https://www.facebook.com/groups/1209330427840782';

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

export const run = async (): Promise<void> => {
  const input = (await Actor.getInput()) as FbGroupMediaActorInput | null;
  const startUrls = input?.startUrls ?? [];
  const urls = startUrls
    .map((item: string | { url?: string }) => (typeof item === 'string' ? item : item?.url))
    .filter((u): u is string => !!u);
  if (urls.length === 0) urls.push(DEFAULT_GROUP_URL);

  const crawler = new PlaywrightCrawler({
    requestHandler: async ({ page, request }) => {
      console.log('[CRAWLER] Processing:', request.url);

      // Load cookies
      const inputNow = (await Actor.getInput()) as FbGroupMediaActorInput | null;
      if (inputNow?.cookies) {
        const cookies = parseCookieString(inputNow.cookies);
        await page.context().addCookies(cookies);
        console.log('[CRAWLER] Added', cookies.length, 'cookies');
      }

      // Navigate and wait
      await page.goto(request.url);
      await page.waitForLoadState('networkidle');

      console.log('[CRAWLER] Page loaded, title:', await page.title());

      // Save screenshot for debugging
      try {
        await Actor.setValue('screenshot.png', await page.screenshot());
      } catch (e) {
        console.log('[CRAWLER] Screenshot failed:', e);
      }

      // Basic member scraping
      const members = await page.$$eval('[aria-label*="Member"]', (els) =>
        els.map((el) => el.textContent).filter(Boolean)
      );

      console.log('[CRAWLER] Found', members.length, 'members');
      await Actor.pushData({ members, url: request.url });
    },
    maxRequestsPerCrawl: urls.length,
    headless: true,
  });

  await crawler.addRequests(urls.map((url) => ({ url })));

  console.log('[CRAWLER] Starting...');
  await crawler.run();
  console.log('[CRAWLER] Finished');
};
