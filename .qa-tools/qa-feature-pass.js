const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const QA = path.join(ROOT, 'qa-assets');
const APP_URL = 'http://127.0.0.1:5511/Mr.%20Card%20Arora.html';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function setInputValue(page, selector, value) {
  await page.locator(selector).fill('');
  await page.locator(selector).fill(String(value));
}

async function main() {
  try {
    await fetch('http://127.0.0.1:5511/api/library', { method: 'DELETE' });
  } catch (err) {
    // Server reset is best-effort.
  }

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 1200 }
  });

  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];

  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.status() !== 409 && !response.url().endsWith('/favicon.ico')) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
      return fetch('/api/library', { method: 'DELETE' }).catch(() => null);
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.setInputFiles('#bg-inp', path.join(QA, 'background.png'));
    await page.waitForFunction(() => {
      const img = document.getElementById('card-bg-img');
      return !!img && img.style.display !== 'none' && img.src;
    });
    await page.setInputFiles('#logo-multi-inp', [path.join(QA, 'qa_logo.png')]);
    await page.waitForSelector('#logo-grid button');
    await page.locator('#logo-grid button').first().click();

    await page.locator('#c-orig-strike').fill('#ff4d6d');
    await page.waitForTimeout(200);
    const strikeStyle = await page.evaluate(() => getComputedStyle(document.getElementById('tx-orig'), '::after').backgroundColor);
    assert(strikeStyle.includes('255, 77, 109'), 'Separate strike line color did not render on original price');

    const assetCounts = await page.evaluate(() => ({
      backgrounds: document.querySelectorAll('#asset-bg-grid .asset-item').length,
      logos: document.querySelectorAll('#asset-logo-grid .asset-item').length
    }));
    assert(assetCounts.backgrounds >= 1, 'Asset manager did not store uploaded background');
    assert(assetCounts.logos >= 1, 'Asset manager did not store uploaded logo');

    await setInputValue(page, '#f-subtitle', 'Draft Recovery Check');
    await page.waitForTimeout(1400);
    const draftExists = await page.evaluate(() => !!localStorage.getItem('ucs4_editor_draft'));
    assert(draftExists, 'Autosave draft was not written to localStorage');

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const banner = document.getElementById('draft-banner');
      return !!banner && getComputedStyle(banner).display !== 'none';
    }, { timeout: 4000 });
    assert(await page.locator('#draft-banner').isVisible(), 'Draft recovery banner did not appear');
    await page.locator('#draft-banner button', { hasText: 'Restore draft' }).click();
    await page.waitForTimeout(300);
    assert((await page.locator('#f-subtitle').inputValue()) === 'Draft Recovery Check', 'Draft restore did not bring editor state back');

    await page.locator('button', { hasText: 'Save' }).nth(0).click();
    await page.locator('#mo-save').waitFor({ state: 'visible' });
    await setInputValue(page, '#save-name', 'VIP Alpha');
    await setInputValue(page, '#save-tags', 'vip, growth');
    await setInputValue(page, '#save-new-folder', 'QA Search Tags');
    await page.locator('#mo-save button', { hasText: 'Save' }).click();
    await page.waitForTimeout(700);

    await page.locator('button', { hasText: '+ New' }).nth(0).click();
    await page.locator('#mo-new button', { hasText: 'Start Fresh' }).click();
    await setInputValue(page, '#f-subtitle', 'Search Beta');
    await page.locator('button', { hasText: 'Save' }).nth(0).click();
    await page.locator('#mo-save').waitFor({ state: 'visible' });
    await setInputValue(page, '#save-name', 'General Beta');
    await setInputValue(page, '#save-tags', 'standard');
    await page.selectOption('#save-folder', { label: 'QA Search Tags' });
    await page.locator('#mo-save button', { hasText: 'Save' }).click();
    await page.waitForTimeout(700);

    await page.locator('#rtab-library').click();
    await setInputValue(page, '#lib-search', 'vip');
    await page.waitForTimeout(250);
    let visibleCards = await page.locator('.ci').evaluateAll(nodes =>
      nodes.filter(node => node.offsetParent !== null).map(node => node.querySelector('.ci-name')?.textContent?.trim())
    );
    assert(visibleCards.length === 1 && visibleCards[0] === 'VIP Alpha', 'Library search did not filter down to the tagged card');

    await setInputValue(page, '#lib-search', '');
    await page.waitForTimeout(250);
    await page.locator('.tag-chip', { hasText: 'vip' }).click();
    await page.waitForTimeout(250);
    visibleCards = await page.locator('.ci').evaluateAll(nodes =>
      nodes.filter(node => node.offsetParent !== null).map(node => node.querySelector('.ci-name')?.textContent?.trim())
    );
    assert(visibleCards.length === 1 && visibleCards[0] === 'VIP Alpha', 'Tag filter did not isolate the expected card');
    await page.locator('.tag-chip.active', { hasText: 'vip' }).click();

    await page.locator('#nav-bulk').click();
    await page.setInputFiles('#bulk-xl-inp', path.join(QA, 'bulk_cards.csv'));
    await page.waitForTimeout(500);
    let validationState = await page.evaluate(() => bulkValidationState);
    assert(validationState.errors.length >= 1, 'Validation should report missing background before generation');

    await page.setInputFiles('#bulk-bg-inp', path.join(QA, 'background.png'));
    await page.setInputFiles('#bulk-zip-inp', path.join(QA, 'logos.zip'));
    await page.waitForTimeout(800);
    validationState = await page.evaluate(() => bulkValidationState);
    assert(validationState.errors.length === 0, 'Validation errors should clear after valid bulk assets are provided');

    await page.locator('#nav-editor').click();
    const snapped = await page.evaluate(() => {
      const stage = document.getElementById('card-stage').getBoundingClientRect();
      const subtitle = document.getElementById('tx-subtitle').getBoundingClientRect();
      startDragPatched(subtitle.left + subtitle.width / 2, subtitle.top + 6, document.getElementById('tx-subtitle'));
      doDrag(stage.left + stage.width / 2 + 2, subtitle.top + 6);
      const guideOn = document.getElementById('guide-v').classList.contains('on');
      dragging = false;
      hideSnapGuides();
      if (selEl) selEl.classList.remove('drag');
      return guideOn;
    });
    assert(snapped, 'Snap guide did not appear while dragging near a snap line');

    const beforeDrag = await page.evaluate(() => ({ ...pos.subtitle }));
    const subtitleBox = await page.locator('#tx-subtitle').boundingBox();
    assert(subtitleBox, 'Subtitle element not available for drag test');
    await page.mouse.move(subtitleBox.x + subtitleBox.width / 2, subtitleBox.y + subtitleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(subtitleBox.x + subtitleBox.width / 2 + 60, subtitleBox.y + subtitleBox.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterDrag = await page.evaluate(() => ({ ...pos.subtitle }));
    assert(Math.abs(afterDrag.left - beforeDrag.left) > 0.2 || Math.abs(afterDrag.top - beforeDrag.top) > 0.2, 'Canvas drag did not change subtitle position');

    await page.keyboard.down('Control');
    await page.keyboard.press('KeyZ');
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);
    const afterDragUndo = await page.evaluate(() => ({ ...pos.subtitle }));
    assert(Math.abs(afterDragUndo.left - beforeDrag.left) < 0.2 && Math.abs(afterDragUndo.top - beforeDrag.top) < 0.2, 'Ctrl+Z did not undo canvas drag');

    await page.keyboard.down('Control');
    await page.keyboard.press('KeyY');
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);
    const afterDragRedo = await page.evaluate(() => ({ ...pos.subtitle }));
    assert(Math.abs(afterDragRedo.left - afterDrag.left) < 0.2 && Math.abs(afterDragRedo.top - afterDrag.top) < 0.2, 'Ctrl+Y did not redo canvas drag');

    await setInputValue(page, '#f-subtitle', 'Undo Shortcut Check');
    await page.waitForTimeout(700);
    await page.keyboard.down('Control');
    await page.keyboard.press('Alt+KeyZ');
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);
    assert((await page.locator('#f-subtitle').inputValue()) !== 'Undo Shortcut Check', 'Ctrl+Alt+Z did not undo the latest edit');

    const significantConsoleErrors = consoleErrors.filter(msg =>
      msg !== 'Failed to load resource: the server responded with a status of 404 (File not found)' &&
      msg !== 'Failed to load resource: the server responded with a status of 409 (Conflict)'
    );
    assert(pageErrors.length === 0, 'Page errors: ' + pageErrors.join(' | '));
    assert(significantConsoleErrors.length === 0, 'Console errors: ' + significantConsoleErrors.join(' | '));
    assert(httpErrors.length === 0, 'HTTP errors: ' + httpErrors.join(' | '));

    console.log(JSON.stringify({
      ok: true,
      assetCounts,
      validationState,
      visibleCards,
      pageErrors,
      consoleErrors: significantConsoleErrors,
      httpErrors
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
