import {expect, test} from '@playwright/test';

test.skip(process.env.PRODUCTION_PREVIEW_TEST !== '1', 'Requires isolated production build runner');

for (const width of [1280, 390]) {
  test(`production marketplace cards and navigation at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900});
    await page.goto('/');
    const local = page.getByRole('link').filter({has: page.getByRole('heading', {name: 'Local Marketplace', exact: true})});
    const business = page.getByRole('link').filter({has: page.getByRole('heading', {name: 'Business Marketplace', exact: true})});
    await expect(local).toHaveAttribute('href', '/marketplace/account');
    await expect(local).toContainText('Explore Marketplace');
    await expect(business).toHaveAttribute('href', '/b2b');
    await expect(business).toContainText('Coming Soon');
    await expect(business).toContainText('not publicly operational');
    await expect(page.getByText('Invited beta · deterministic mock agents')).toBeVisible();
    const a = (await local.boundingBox())!;
    const b = (await business.boundingBox())!;
    if (width > 768) {
      expect(Math.abs(a.y - b.y)).toBeLessThan(2);
      expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
    } else {
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const nav = page.getByRole('navigation', {name: 'Account navigation'});
    await expect(nav.getByRole('link', {name: 'Log in', exact: true})).toBeVisible();
    await nav.getByRole('link', {name: 'Business', exact: true}).click();
    await expect(page).toHaveURL(/\/b2b$/);
    await expect(page.getByRole('heading', {name: 'Business Marketplace', exact: true})).toBeVisible();
    await expect(page.getByText('Coming Soon · Preview')).toBeVisible();
    await expect(page.getByText('This preview is informational', {exact: false})).toBeVisible();
    await expect(page.locator('form, input, select')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Coming Soon · Preview')).toBeVisible();
    await page.getByRole('link', {name: 'Back to SwApStEr'}).click();
    await business.click();
    await expect(page.getByText('Coming Soon · Preview')).toBeVisible();
  });
}

test('production demo stays unavailable and preview makes no external requests', async ({page, request}) => {
  const external: string[] = [];
  page.on('request', req => {
    if (new URL(req.url()).origin !== new URL(process.env.PLAYWRIGHT_BASE_URL!).origin) external.push(req.url());
  });
  await page.goto('/b2b');
  await expect(page.getByText('Coming Soon · Preview')).toBeVisible();
  expect(external).toEqual([]);
  expect((await request.get('/marketplace')).status()).toBe(404);
});
