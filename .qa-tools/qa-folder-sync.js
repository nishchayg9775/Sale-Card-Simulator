const fs = require('fs');
const path = require('path');
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

async function waitForToast(page, text, timeout = 20000) {
  await page.waitForFunction(
    expected => {
      const el = document.getElementById('toast');
      return !!el && el.textContent.includes(expected);
    },
    text,
    { timeout }
  );
}

async function main() {
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
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') await dialog.accept('QA Folder Sync');
    else await dialog.accept();
  });

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      try {
        await fetch('/api/library', { method: 'DELETE' });
      } catch (e) {}
    });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    await page.locator('#nav-bulk').click();
    await page.setInputFiles('#bulk-bg-inp', path.join(QA, 'background.png'));
    await page.setInputFiles('#bulk-zip-inp', path.join(QA, 'logos.zip'));
    await page.setInputFiles('#bulk-xl-inp', path.join(QA, 'bulk_cards.csv'));
    await page.waitForFunction(() => typeof bulkRows !== 'undefined' && bulkRows.length > 1);

    await page.evaluate(() => { mkFolder('QA Folder Sync'); refreshBulkFolders(); });
    await page.selectOption('#bulk-fsel', { label: 'QA Folder Sync' });
    await page.locator('#gen-btn').click();
    await page.waitForFunction(() => {
      const el = document.getElementById('prog-txt');
      return !!el && el.textContent.includes('All');
    }, { timeout: 120000 });
    await waitForToast(page, 'generated and saved to library');

    await page.locator('#nav-editor').click();
    await page.locator('#rtab-library').click();
    await page.waitForSelector('.ci');

    const folderInfo = await page.evaluate(() => {
      const lib = JSON.parse(localStorage.getItem('ucs4'));
      const folder = lib.folders.find(f => f.name === 'QA Folder Sync');
      return {
        folderId: folder.id,
        cardIds: folder.cards.map(c => c.id),
        cardNames: folder.cards.map(c => c.name),
        rawFinals: folder.cards.map(c => c.data.final),
        rawSubtitles: folder.cards.map(c => c.data.subtitle),
        sharedOverrides: folder.sharedOverrides || {}
      };
    });

    assert(folderInfo.cardIds.length >= 2, 'Need at least two cards in the bulk folder');

    await page.locator(`#ci-${folderInfo.cardIds[0]}`).click();
    await page.waitForTimeout(400);

    const bannerText = await page.locator('#folder-sync-banner').textContent();
    assert(
      bannerText.includes('Editing this card only in folder: QA Folder Sync'),
      'Folder sync banner did not appear with expected text'
    );

    await page.evaluate(() => {
      const input = document.getElementById('c-subtitle');
      input.value = '#ff3366';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(250);

    await setInputValue(page, '#f-subtitle', 'Folder Synced Title');
    await page.waitForTimeout(250);

    await page.locator('button', { hasText: 'Save' }).nth(0).click();
    await page.locator('#mo-save').waitFor({ state: 'visible' });
    await page.locator('#mo-save button', { hasText: 'Save' }).click();
    await waitForToast(page, 'Updated in');

    const beforeApplyState = await page.evaluate(() => {
      const lib = JSON.parse(localStorage.getItem('ucs4'));
      const folder = lib.folders.find(f => f.name === 'QA Folder Sync');
      return {
        sharedOverrides: folder.sharedOverrides || {},
        cards: folder.cards.map(c => ({
          id: c.id,
          final: c.data.final,
          subtitle: c.data.subtitle,
          cSubtitle: c.data.cSubtitle
        })),
        editor: {
          currentSubtitle: document.getElementById('f-subtitle')?.value,
          baseSubtitle: typeof folderEditInitialData !== 'undefined' ? folderEditInitialData?.subtitle : null,
          baseColor: typeof folderEditInitialData !== 'undefined' ? folderEditInitialData?.cSubtitle : null,
          stateSubtitle: typeof getState === 'function' ? getState()?.subtitle : null,
          stateColor: typeof getState === 'function' ? getState()?.cSubtitle : null
        }
      };
    });

    assert(
      beforeApplyState.cards[0].subtitle === 'Folder Synced Title' &&
      beforeApplyState.cards[1].subtitle === folderInfo.rawSubtitles[1],
      'Individual save should update only the edited card before Apply to All'
    );
    assert(
      beforeApplyState.cards[0].cSubtitle === '#ff3366' &&
      beforeApplyState.cards[1].cSubtitle !== '#ff3366',
      'Individual style change leaked to other cards before Apply to All'
    );

    await page.evaluate(() => {
      const input = document.getElementById('c-subtitle');
      input.value = '#22aa55';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    await setInputValue(page, '#f-subtitle', 'Folder Applied Title');
    await page.waitForTimeout(250);
    await page.locator('#folder-sync-apply').click();
    await waitForToast(page, 'Applied ');
    await page.waitForTimeout(800);

    const syncedState = await page.evaluate(() => {
      const lib = JSON.parse(localStorage.getItem('ucs4'));
      const folder = lib.folders.find(f => f.name === 'QA Folder Sync');
      return {
        sharedOverrides: folder.sharedOverrides || {},
        cards: folder.cards.map(c => ({
          id: c.id,
          final: c.data.final,
          subtitle: c.data.subtitle
        }))
      };
    });

    assert(Object.keys(syncedState.sharedOverrides).length === 0, 'Folder should not rely on sharedOverrides after Apply to All');
    assert(
      syncedState.cards[0].subtitle === 'Folder Applied Title' &&
      syncedState.cards[1].subtitle === 'Folder Applied Title',
      'Apply to All did not propagate subtitle text to every card'
    );
    assert(
      syncedState.cards[0].final === folderInfo.rawFinals[0] &&
      syncedState.cards[1].final === folderInfo.rawFinals[1],
      'Card-specific price data changed unexpectedly during Apply to All'
    );

    await page.locator(`#ci-${folderInfo.cardIds[1]}`).click();
    await page.waitForTimeout(600);

    const renderedCard = await page.evaluate(() => ({
      subtitleText: document.getElementById('tx-subtitle').textContent,
      subtitleColor: getComputedStyle(document.getElementById('tx-subtitle')).color,
      finalText: document.getElementById('tx-final').textContent
    }));

    assert(renderedCard.subtitleText === 'Folder Applied Title', 'Second card did not inherit applied subtitle text');
    assert(renderedCard.subtitleColor === 'rgb(34, 170, 85)', 'Second card did not inherit applied subtitle color');
    assert(
      renderedCard.finalText.includes(folderInfo.rawFinals[1]),
      `Second card lost its own price content after Apply to All (expected raw final ${folderInfo.rawFinals[1]}, got ${renderedCard.finalText})`
    );

    const thumbCount = await page.evaluate(() => {
      const folder = (LIB.folders || []).find(f => f.name === 'QA Folder Sync');
      return folder ? folder.cards.filter(c => !!c.thumb).length : 0;
    });
    assert(thumbCount === folderInfo.cardIds.length, 'Folder thumbnails were not preserved after sync refresh');

    const significantConsoleErrors = consoleErrors.filter(msg => msg !== 'Failed to load resource: the server responded with a status of 404 (File not found)');
    assert(pageErrors.length === 0, 'Page errors: ' + pageErrors.join(' | '));
    assert(significantConsoleErrors.length === 0, 'Console errors: ' + significantConsoleErrors.join(' | '));
    assert(httpErrors.length === 0, 'HTTP errors: ' + httpErrors.join(' | '));

    console.log(JSON.stringify({
      ok: true,
      folder: 'QA Folder Sync',
      cards: folderInfo.cardNames.length,
      appliedSubtitle: syncedState.cards[1].subtitle,
      secondCardFinal: renderedCard.finalText
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
