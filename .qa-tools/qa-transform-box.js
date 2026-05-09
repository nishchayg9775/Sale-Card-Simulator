const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5511/Mr.%20Card%20Arora.html';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const QA = path.join(ROOT, 'qa-assets');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getSelectionState(page, key) {
  return page.evaluate((selectedKey) => {
    const stage = document.getElementById('card-stage');
    const el = document.getElementById({
      badge: 'tx-badge',
      subtitle: 'tx-subtitle',
      offer: 'tx-offer',
      pricing: 'tx-pricing'
    }[selectedKey]);
    if (!stage || !el) return null;
    const stageRect = stage.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const box = document.getElementById('transform-box');
    const boxRect = box.getBoundingClientRect();
    const data = getData();
    return {
      sizes: {
        logo: parseInt(document.getElementById('sz-logo')?.value || '0', 10),
        subtitle: parseInt(document.getElementById('sz-subtitle')?.value || '0', 10),
        bignum: parseInt(document.getElementById('sz-bignum')?.value || '0', 10),
        months: parseInt(document.getElementById('sz-months')?.value || '0', 10),
        free: parseInt(document.getElementById('sz-free')?.value || '0', 10),
        sublabel: parseInt(document.getElementById('sz-sublabel')?.value || '0', 10),
        orig: parseInt(document.getElementById('sz-orig')?.value || '0', 10),
        final: parseInt(document.getElementById('sz-final')?.value || '0', 10)
      },
      pos: data.pos[selectedKey],
      transform: getComputedStyle(el).transform,
      rect: {
        left: rect.left - stageRect.left,
        top: rect.top - stageRect.top,
        width: rect.width,
        height: rect.height,
        centerX: rect.left - stageRect.left + (rect.width / 2),
        centerY: rect.top - stageRect.top + (rect.height / 2)
      },
      box: {
        on: box.classList.contains('on'),
        left: boxRect.left - stageRect.left,
        top: boxRect.top - stageRect.top,
        width: boxRect.width,
        height: boxRect.height
      }
    };
  }, key);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); return fetch('/api/library', { method: 'DELETE' }).catch(() => null); });
    await page.reload({ waitUntil: 'networkidle' });

    await page.setInputFiles('#bg-inp', path.join(QA, 'background.png'));
    await page.waitForFunction(() => document.getElementById('card-bg-img')?.style.display !== 'none');
    await page.waitForTimeout(300);

    await page.locator('#tx-offer').click();
    await page.waitForTimeout(150);
    let before = await getSelectionState(page, 'offer');
    assert(before && before.box.on, 'Transform box did not appear for offer selection');

    const se = page.locator('#transform-box .h-se');
    const seBox = await se.boundingBox();
    assert(seBox, 'SE handle is not visible');
    await page.mouse.move(seBox.x + (seBox.width / 2), seBox.y + (seBox.height / 2));
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(120);
    let afterClickOnly = await getSelectionState(page, 'offer');
    assert(afterClickOnly.sizes.bignum === before.sizes.bignum, 'Clicking handle without drag changed offer size');
    assert(Math.abs(afterClickOnly.rect.left - before.rect.left) <= 1, 'Clicking handle without drag shifted offer horizontally');
    assert(Math.abs(afterClickOnly.rect.top - before.rect.top) <= 1, 'Clicking handle without drag shifted offer vertically');

    await page.mouse.move(seBox.x + (seBox.width / 2), seBox.y + (seBox.height / 2));
    await page.mouse.down();
    await page.mouse.move(seBox.x + 36, seBox.y + 28, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    let afterFree = await getSelectionState(page, 'offer');
    assert(afterFree.sizes.bignum > before.sizes.bignum, 'Free resize did not increase offer size');
    assert(afterFree.box.width > before.box.width, 'Transform box width did not update after free resize');
    assert(afterFree.rect.left >= -1 && afterFree.rect.top >= -1, 'Offer moved outside stage after free resize');
    assert(afterFree.rect.left + afterFree.rect.width <= 501, 'Offer overflowed stage width after free resize');
    assert(afterFree.rect.top + afterFree.rect.height <= 501, 'Offer overflowed stage height after free resize');
    assert(!/scale/i.test(afterFree.transform), 'Offer still uses CSS scale transform');

    await page.evaluate(() => selectLayer('subtitle'));
    await page.waitForTimeout(150);
    before = await getSelectionState(page, 'subtitle');
    const subHandle = await page.locator('#transform-box .h-se').boundingBox();
    assert(subHandle, 'Subtitle SE handle is not visible');
    await page.keyboard.down('Shift');
    await page.mouse.move(subHandle.x + (subHandle.width / 2), subHandle.y + (subHandle.height / 2));
    await page.mouse.down();
    await page.mouse.move(subHandle.x + 42, subHandle.y + 18, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(150);

    const afterShift = await getSelectionState(page, 'subtitle');
    assert(afterShift.sizes.subtitle > before.sizes.subtitle, 'Shift resize did not increase subtitle size');
    assert(!/scale/i.test(afterShift.transform), 'Subtitle still uses CSS scale transform');

    await page.evaluate(() => selectLayer('pricing'));
    await page.waitForTimeout(150);
    before = await getSelectionState(page, 'pricing');
    const pricingHandle = await page.locator('#transform-box .h-se').boundingBox();
    assert(pricingHandle, 'Pricing SE handle is not visible');
    await page.keyboard.down('Shift');
    await page.keyboard.down('Alt');
    await page.mouse.move(pricingHandle.x + (pricingHandle.width / 2), pricingHandle.y + (pricingHandle.height / 2));
    await page.mouse.down();
    await page.mouse.move(pricingHandle.x + 48, pricingHandle.y + 26, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(150);

    const afterAltShift = await getSelectionState(page, 'pricing');
    assert(afterAltShift.sizes.orig > before.sizes.orig, 'Alt+Shift resize did not increase pricing size');
    assert(afterAltShift.sizes.final > before.sizes.final, 'Alt+Shift resize did not increase final pricing size');
    assert(Math.abs(afterAltShift.rect.centerX - before.rect.centerX) <= 1.5, 'Alt+Shift resize did not preserve horizontal center');
    assert(Math.abs(afterAltShift.rect.centerY - before.rect.centerY) <= 1.5, 'Alt+Shift resize did not preserve vertical center');
    assert(!/scale/i.test(afterAltShift.transform), 'Pricing still uses CSS scale transform');

    console.log(JSON.stringify({
      ok: true,
      offerSizes: afterFree.sizes,
      subtitleSizes: afterShift.sizes,
      pricingSizes: afterAltShift.sizes
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
