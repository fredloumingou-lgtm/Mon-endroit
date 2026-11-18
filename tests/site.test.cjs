const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const basePath = '/Mon-endroit/';
let server;
let browser;
let url;

before(async () => {
  // Reproduce GitHub Pages project-relative paths, without contacting the public site.
  server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(basePath)) {
        response.writeHead(404).end();
        return;
      }
      const file = path.resolve(root, pathname.slice(basePath.length) || 'index.html');
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const types = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
      response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      response.end(fs.readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}${basePath}`;
  const executablePath = process.env.CHROMIUM_PATH ||
    (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openPage(options = {}) {
  const page = await browser.newPage({ reducedMotion: 'reduce', ...options });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(url) && response.status() >= 400) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  // External video availability is tested separately, never disguised as a passing local check.
  await page.route('https://**/*', route => route.abort());
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  return { page, failures };
}

async function decodeImages(page) {
  // Force loading only in the test, including images below the fold.
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => {
    image.loading = 'eager';
    return image.decode();
  })));
}

async function checkAccessibility(page) {
  await page.addScriptTag({ content: axe });
  const violations = await page.evaluate(async () => {
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }
    });
    return result.violations.map(item => ({
      id: item.id,
      targets: item.nodes.map(node => node.target)
    }));
  });
  assert.deepEqual(violations, [], JSON.stringify(violations));
}

for (const width of [320, 390, 768, 1440]) {
  test(`Affichage, navigation et accessibilité à ${width}px`, async () => {
    const { page, failures } = await openPage({ viewport: { width, height: 900 } });
    try {
      await decodeImages(page);
      assert.equal(await page.locator('img').count(), 18);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('main').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('img:not([alt])').count(), 0);
      await checkAccessibility(page);
      if (process.env.SITE_SCREENSHOTS) {
        fs.mkdirSync(process.env.SITE_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SITE_SCREENSHOTS, `accueil-${width}.png`) });
      }

      const links = page.locator('nav a');
      assert.equal(await links.count(), 7);
      for (let index = 0; index < await links.count(); index++) {
        const link = links.nth(index);
        const box = await link.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, 'Zone tactile de navigation');
        const href = await link.getAttribute('href');
        await link.click();
        await page.waitForFunction(id => document.activeElement.id === id, href.slice(1));
        const target = await page.locator(href).boundingBox();
        const navigation = await page.locator('nav').boundingBox();
        assert.ok(target.y >= (width <= 800 ? navigation.y + navigation.height : 0) - 1,
          'Le menu ne doit pas masquer la rubrique');
        if (width <= 800) assert.ok(Math.abs(navigation.y) < 1, 'Menu mobile fixe au défilement');
        if (href === '#musique' && process.env.SITE_SCREENSHOTS) {
          await page.screenshot({ path: path.join(process.env.SITE_SCREENSHOTS, `musique-${width}.png`) });
        }
      }

      for (const link of await page.locator('main a').all()) {
        const box = await link.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, 'Zone tactile du contenu');
      }
      await page.locator('.retour-haut').click();
      await page.waitForFunction(() => document.activeElement.id === 'haut' && scrollY < 2);
      assert.deepEqual(failures, []);
    } finally {
      await page.close();
    }
  });
}

test('Boutons musique et séries : clavier, sélection, images et accessibilité', async () => {
  const { page, failures } = await openPage({ viewport: { width: 390, height: 900 } });
  try {
    const groups = [
      { selector: '.bouton-musique', panel: '#carte-musique', headings: [
        'PARTYNEXTDOOR', 'Victoria Monét feat. Bryson Tiller', 'Rob Mullins', 'Tame Impala'
      ] },
      { selector: '.serie-mini', panel: '#serie-info', headings: [
        'The Gentlemen', 'Reacher', 'Stranger Things', 'Billions', 'Snowfall'
      ] }
    ];
    for (const group of groups) {
      const buttons = page.locator(group.selector);
      assert.equal(await buttons.count(), group.headings.length);
      assert.equal(await page.locator(`${group.selector}[aria-pressed="true"]`).count(), 1);
      for (let index = 0; index < await buttons.count(); index++) {
        const button = buttons.nth(index);
        await button.focus();
        await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator(`${group.selector}[aria-pressed="true"]`).count(), 1);
        assert.equal(await button.evaluate(element => document.activeElement === element), true);
        const title = (await page.locator(`${group.panel} h3`).first().textContent()).trim().replace(/\s+/g, ' ');
        assert.equal(title, group.headings[index]);
        assert.equal(await page.locator(group.panel).getAttribute('aria-live'), 'polite');
        await decodeImages(page);
        assert.equal(await page.locator('img:not([alt])').count(), 0);
        await checkAccessibility(page);
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    await page.close();
  }
});

test('Évitement clavier, focus visible et réduction des mouvements', async () => {
  const { page, failures } = await openPage({ viewport: { width: 320, height: 700 } });
  try {
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.lien-evitement').evaluate(e => document.activeElement === e), true);
    const box = await page.locator('.lien-evitement').boundingBox();
    assert.ok(box.y >= 0);
    // Tabbing must reveal every link in the horizontally scrollable menu.
    for (const link of await page.locator('nav a').all()) {
      await page.keyboard.press('Tab');
      assert.equal(await link.evaluate(e => document.activeElement === e), true);
      const box = await link.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320, `Lien au clavier visible : ${await link.textContent()} ${JSON.stringify(box)}`);
    }
    await page.locator('.lien-evitement').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement.id === 'contenu');
    await page.locator('.bouton-musique').first().focus();
    assert.equal(await page.locator('.bouton-musique').first().evaluate(e => getComputedStyle(e).outlineStyle), 'solid');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    assert.equal(await page.locator('.serie-mini').first().evaluate(e => getComputedStyle(e).transitionDuration), '0s');
    assert.deepEqual(failures, []);
  } finally {
    await page.close();
  }
});

test('Navigation sans JavaScript et zoom à 200 %', async () => {
  for (const options of [
    { javaScriptEnabled: false, viewport: { width: 390, height: 900 } },
    { viewport: { width: 320, height: 700 } }
  ]) {
    const { page, failures } = await openPage(options);
    try {
      if (options.javaScriptEnabled !== false) {
        await page.locator('html').evaluate(element => { element.style.zoom = '2'; });
      }
      await page.locator('nav a[href="#cinema"]').click();
      assert.ok(page.url().endsWith('#cinema'));
      const box = await page.locator('#titre-cinema').boundingBox();
      const nav = await page.locator('nav').boundingBox();
      assert.ok(box.y >= nav.y + nav.height - 1, 'Titre visible après le saut');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('.retour-haut').click();
      assert.ok(page.url().endsWith('#haut'));
      assert.deepEqual(failures, []);
    } finally {
      await page.close();
    }
  }
});
