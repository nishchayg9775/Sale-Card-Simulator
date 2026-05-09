const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://127.0.0.1:5511/Mr.%20Card%20Arora.html';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const QA = path.join(ROOT, 'qa-assets');
function assert(c, m){ if(!c) throw new Error(m); }
async function centerDelta(page){
  return page.evaluate(() => {
    const subtitle = document.getElementById('tx-subtitle');
    const offer = document.getElementById('tx-offer');
    const pricing = document.getElementById('tx-pricing');
    const getVerticalBounds = (el) => {
      if (el.id === 'tx-offer') {
        const kids = Array.from(el.children).filter(child => {
          const st = getComputedStyle(child);
          return st.display !== 'none' && child.offsetHeight > 0;
        });
        if (kids.length) {
          const top = el.offsetTop + Math.min(...kids.map(child => child.offsetTop + (parseFloat(getComputedStyle(child).marginTop) || 0)));
          const bottom = el.offsetTop + Math.max(...kids.map(child => child.offsetTop + child.offsetHeight + (parseFloat(getComputedStyle(child).marginBottom) || 0)));
          return { top, bottom };
        }
      }
      const st = getComputedStyle(el);
      return {
        top: el.offsetTop + (parseFloat(st.paddingTop) || 0),
        bottom: el.offsetTop + el.offsetHeight - (parseFloat(st.paddingBottom) || 0)
      };
    };
    const sb = getVerticalBounds(subtitle);
    const ob = getVerticalBounds(offer);
    const pb = getVerticalBounds(pricing);
    const targetCenter = (sb.bottom + pb.top) / 2;
    const offerCenter = (ob.top + ob.bottom) / 2;
    return { delta: Math.abs(targetCenter - offerCenter), targetCenter, offerCenter, pos: window.pos };
  });
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
    await page.locator('#f-subtitle').fill('Center Test Subtitle');
    await page.locator('#f-sublabel').fill('on 6 Months Plan');
    await page.locator('#f-orig').fill('99,999');
    await page.locator('#f-final').fill('9,999');
    await page.waitForTimeout(500);
    let result = await centerDelta(page);
    assert(result.delta <= 1.5, 'Initial auto-center failed: ' + JSON.stringify(result));

    await page.locator('button', { hasText: 'Save' }).nth(0).click();
    await page.locator('#mo-save').waitFor({ state: 'visible' });
    await page.locator('#save-name').fill('Center Rule Card');
    await page.locator('#save-new-folder').fill('Center Rule Folder');
    await page.locator('#mo-save button', { hasText: 'Save' }).click();
    await page.waitForTimeout(900);

    await page.locator('#rtab-library').click();
    await page.locator('.ci', { hasText: 'Center Rule Card' }).click();
    await page.waitForTimeout(600);
    result = await centerDelta(page);
    assert(result.delta <= 1.5, 'Library load auto-center failed: ' + JSON.stringify(result));

    await page.locator('#rtab-layers').click();
    await page.evaluate(() => {
      selectLayer('pricing');
      const newY = Math.max(52, (pos.pricing?.top || 68) - 4);
      lePosSync('y', newY);
    });
    await page.waitForTimeout(400);
    result = await centerDelta(page);
    assert(result.delta <= 1.5, 'Layer edit auto-center failed: ' + JSON.stringify(result));

    console.log(JSON.stringify({ ok: true, delta: result.delta }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
