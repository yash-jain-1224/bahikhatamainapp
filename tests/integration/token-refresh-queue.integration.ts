import { test, expect } from '@playwright/test';
import { authenticatedSession } from '../helpers';

/**
 * Regression test for the silent-refresh queue deadlock.
 *
 * A refresh can start two ways: the axios interceptor starts one after a 401,
 * or App.tsx's proactive timer / focus handler calls refreshAccessToken()
 * directly. The queue used to be drained only by the interceptor, so a request
 * that 401'd while the *proactive* refresh was in flight was pushed onto
 * failedQueue and never resolved or rejected. Its promise never settled, the
 * page's `finally { setLoading(false) }` never ran, and the table span on its
 * skeleton forever — no error, no retry, only a manual reload.
 *
 * Three details are load-bearing, each of which made an earlier draft of this
 * test pass against the bug:
 *   - the second request must arrive via SPA navigation or an in-page refetch,
 *     never page.goto(). A full navigation remounts the app and discards the
 *     in-flight refresh, so the interceptor starts its own and drains it
 *     through the path that always worked.
 *   - the refresh must be the *proactive* one. An interceptor-initiated
 *     refresh drained correctly even before the fix.
 *   - assert on the replay, not on the loading skeleton. `toBeHidden()` also
 *     passes when the element never existed, which made the original assertion
 *     vacuous.
 */
test.describe('Silent refresh: queued requests always settle', () => {
  test('a request that 401s during a proactive refresh is replayed once it lands', async ({ page }) => {
    // Fake timers must be installed before the app mounts: App.tsx seeds its
    // refresh throttle from Date.now() at mount and will not refresh again
    // within 5 minutes.
    await page.clock.install();

    await authenticatedSession(page, 'rq');
    await page.goto('/ledger');
    await page.waitForTimeout(1500); // let the initial fetch settle

    const ledgerRequests: number[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/ledger/entries')) ledgerRequests.push(Date.now());
    });

    // Hold /auth/refresh open so the 401 lands while it is still in flight.
    let refreshSeen = 0;
    await page.route('**/auth/refresh', async (route) => {
      refreshSeen += 1;
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });

    // Exactly one ledger request 401s. `times: 1` matters: the replay must
    // reach the real service, or it would 401 again and loop.
    let ledger401s = 0;
    await page.route('**/ledger/entries*', async (route) => {
      ledger401s += 1;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Invalid token' }),
      });
    }, { times: 1 });

    // Past the 5-minute throttle, then fire the proactive refresh.
    await page.clock.fastForward('06:00');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    // Refetch without leaving the page — LedgerPage refetches when `search`
    // changes. This 401 lands while the proactive refresh is still open, which
    // is the exact interleaving that used to deadlock.
    await page.getByPlaceholder(/search/i).first().fill('x');

    // Preconditions: the interleaving we are testing actually occurred.
    await expect.poll(() => refreshSeen, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect.poll(() => ledger401s, { timeout: 10_000 }).toBe(1);

    // The real assertion. The queued request must be replayed after the refresh
    // resolves. Before the fix it was never resolved or rejected, so exactly one
    // ledger request was ever sent and the page hung on its skeleton.
    await expect
      .poll(() => ledgerRequests.length, {
        timeout: 20_000,
        message: 'the 401\'d request should be replayed after the refresh completes',
      })
      .toBeGreaterThanOrEqual(2);
  });
});
