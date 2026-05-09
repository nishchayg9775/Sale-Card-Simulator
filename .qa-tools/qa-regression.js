const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const QA = path.join(ROOT, 'qa-assets');
const DOWNLOADS = path.join(__dirname, 'downloads');
const APP_URL = 'http://127.0.0.1:5511/Mr.%20Card%20Arora.html?debug=1';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
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

async function waitForProgressDone(page, expectedText, timeout = 120000) {
  await page.waitForFunction(
    text => {
      const el = document.getElementById('prog-txt');
      return !!el && el.textContent.includes(text);
    },
    expectedText,
    { timeout }
  );
}

async function setInputValue(page, selector, value) {
  await page.locator(selector).fill('');
  await page.locator(selector).fill(String(value));
}

async function readLibraryState(page) {
  return page.evaluate(() => {
    if (typeof LIB !== 'undefined' && LIB && Array.isArray(LIB.folders)) {
      return JSON.parse(JSON.stringify(LIB));
    }
    const raw = localStorage.getItem('ucs4');
    return raw ? JSON.parse(raw) : { folders: [] };
  });
}

async function main() {
  fs.rmSync(DOWNLOADS, { recursive: true, force: true });
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  try {
    await fetch('http://127.0.0.1:5511/api/library', { method: 'DELETE' });
  } catch (err) {
    // Ignore when the shared-storage server is not running.
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
  const downloads = [];
  const dialogs = [];

  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.status() !== 409 && !response.url().endsWith('/favicon.ico')) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    if (dialog.type() === 'prompt') await dialog.accept('QA Auto Folder');
    else await dialog.accept();
  });
  page.on('download', download => downloads.push(download.suggestedFilename()));

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    assert(await page.locator('#nav-editor').isVisible(), 'Editor tab did not load');
    assert(pageErrors.length === 0, 'Initial page errors: ' + pageErrors.join(' | '));
    const significantConsoleErrors = consoleErrors.filter(msg =>
      msg !== 'Failed to load resource: the server responded with a status of 404 (File not found)' &&
      msg !== 'Failed to load resource: the server responded with a status of 409 (Conflict)'
    );
    assert(significantConsoleErrors.length === 0, 'Initial console errors: ' + consoleErrors.join(' | '));
    assert(httpErrors.length === 0, 'Initial HTTP errors: ' + httpErrors.join(' | '));

    // Editor: upload assets and render
    await page.setInputFiles('#bg-inp', path.join(QA, 'background.png'));
    await page.waitForFunction(() => {
      const img = document.getElementById('card-bg-img');
      return img && img.src && img.style.display !== 'none' && typeof pngW !== 'undefined' && pngW > 0;
    });

    await page.setInputFiles('#logo-multi-inp', [
      path.join(QA, 'qa_logo.png'),
      path.join(QA, 'qa_svg_logo.svg')
    ]);
    await page.waitForSelector('#logo-grid button');
    await page.locator('#logo-grid button').first().click();

    await setInputValue(page, '#f-subtitle', 'QA Subtitle');
    await setInputValue(page, '#f-bignum', '12');
    await setInputValue(page, '#f-months', 'MONTHS');
    await setInputValue(page, '#f-free', 'PLAN');
    await setInputValue(page, '#f-sublabel', 'QA Description');
    await setInputValue(page, '#f-orig', '18,999');
    await setInputValue(page, '#f-final', '9,999');
    await page.locator('button', { hasText: 'Auto-space' }).click();
    await page.locator('button', { hasText: 'Reset' }).click();

    const priceTexts = await page.evaluate(() => ({
      orig: document.getElementById('tx-orig').textContent,
      final: document.getElementById('tx-final').textContent
    }));
    assert(priceTexts.orig.includes('₹') && priceTexts.final.includes('₹'), 'Rupee symbol not applied to pricing');

    // Offer label width match
    const labelWidths = await page.evaluate(() => {
      const months = document.getElementById('tx-months').getBoundingClientRect().width;
      const free = document.getElementById('tx-free').getBoundingClientRect().width;
      return { months, free, delta: Math.abs(months - free) };
    });
    assert(labelWidths.delta < 1.5, `Offer label widths mismatch: ${JSON.stringify(labelWidths)}`);

    // Save new card
    await page.locator('button', { hasText: 'Save' }).nth(0).click();
    await page.locator('#mo-save').waitFor({ state: 'visible' });
    await setInputValue(page, '#save-name', 'QA Card Alpha');
    await setInputValue(page, '#save-new-folder', 'QA Folder A');
    await page.locator('#mo-save button', { hasText: 'Save' }).click();
    await waitForToast(page, 'Saved to');

    let libState = await readLibraryState(page);
    assert(libState.folders.length === 1, 'Expected one folder after initial save');
    assert(libState.folders[0].cards.length === 1, 'Expected one card after initial save');

    // Update save should not duplicate
    await setInputValue(page, '#f-final', '8,888');
    await page.locator('button', { hasText: 'Save' }).nth(0).click();
    await page.locator('#mo-save').waitFor({ state: 'visible' });
    await page.locator('#mo-save button', { hasText: 'Save' }).click();
    await waitForToast(page, 'Updated in');
    libState = await readLibraryState(page);
    assert(libState.folders[0].cards.length === 1, 'Save update duplicated card');
    assert(libState.folders[0].cards[0].data.final === '8,888', 'Updated card data not saved');

    // Export PNG
    const pngPromise = page.waitForEvent('download');
    await page.locator('#export-main-btn').click();
    const pngDownload = await pngPromise;
    await pngDownload.saveAs(path.join(DOWNLOADS, pngDownload.suggestedFilename()));
    assert(/\.png$/i.test(pngDownload.suggestedFilename()), 'PNG export did not use png extension');

    // Export JPEG
    await page.locator('button[title="Export format options"]').click();
    await page.locator('#export-menu .ctx-i', { hasText: 'JPEG' }).click();
    const jpgPromise = page.waitForEvent('download');
    await page.locator('#export-main-btn').click();
    const jpgDownload = await jpgPromise;
    await jpgDownload.saveAs(path.join(DOWNLOADS, jpgDownload.suggestedFilename()));
    assert(/\.jpg$/i.test(jpgDownload.suggestedFilename()), 'JPEG export did not use jpg extension');

    // Undo / redo
    await setInputValue(page, '#f-subtitle', 'Undo Check');
    await page.waitForTimeout(700);
    await page.keyboard.down('Control');
    await page.keyboard.press('z');
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    let subtitle = await page.locator('#f-subtitle').inputValue();
    assert(subtitle !== 'Undo Check', 'Undo did not revert subtitle');
    await page.keyboard.down('Control');
    await page.keyboard.press('y');
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    subtitle = await page.locator('#f-subtitle').inputValue();
    assert(subtitle === 'Undo Check', 'Redo did not restore subtitle');

    // Library preview and multi-select
    await page.locator('#rtab-library').click();
    await page.locator('.ci').first().click();
    await page.waitForTimeout(300);
    const previewName = await page.locator('#cur-name').textContent();
    assert(previewName.includes('QA Card Alpha'), 'Single-click library preview did not load selected card');

    // Bulk setup
    await page.locator('#nav-bulk').click();
    await page.setInputFiles('#bulk-bg-inp', path.join(QA, 'background.png'));
    await page.setInputFiles('#bulk-zip-inp', path.join(QA, 'logos.zip'));
    await page.setInputFiles('#bulk-xl-inp', path.join(QA, 'bulk_cards.csv'));
    await page.waitForFunction(() => typeof bulkRows !== 'undefined' && bulkRows.length > 0);

    await page.evaluate(() => { mkFolder('QA Bulk CSV'); refreshBulkFolders(); });
    await page.waitForFunction(() => {
      const sel = document.getElementById('bulk-fsel');
      return [...sel.options].some(o => o.textContent.includes('QA Bulk CSV'));
    });
    await page.selectOption('#bulk-fsel', { label: 'QA Bulk CSV' });

    const filesBeforeGenerateOnly = listFilesRecursive(DOWNLOADS).length;
    await page.locator('#gen-btn').click();
    await waitForProgressDone(page, 'All');
    await waitForToast(page, 'generated and saved to library');
    await page.waitForTimeout(500);
    await page.waitForFunction(() => {
      const lib = typeof LIB !== 'undefined' && LIB ? LIB : JSON.parse(localStorage.getItem('ucs4') || '{"folders":[]}');
      const folder = (lib.folders || []).find(f => f.name === 'QA Bulk CSV');
      return !!folder && (folder.cards || []).length >= 2;
    }, { timeout: 8000 });
    const filesAfterGenerateOnly = listFilesRecursive(DOWNLOADS).length;
    assert(filesAfterGenerateOnly === filesBeforeGenerateOnly, 'Generate Only unexpectedly downloaded files');

    libState = await readLibraryState(page);
    const bulkFolderCsv = libState.folders.find(f => f.name === 'QA Bulk CSV');
    assert(bulkFolderCsv && bulkFolderCsv.cards.length >= 2, 'Generate Only did not save bulk cards to library');

    // Bulk ZIP export
    await page.locator('#nav-bulk').click();
    const bulkZipPromise = page.waitForEvent('download');
    await page.locator('#gen-zip-btn').click();
    const bulkZip = await bulkZipPromise;
    await bulkZip.saveAs(path.join(DOWNLOADS, bulkZip.suggestedFilename()));
    assert(/\.zip$/i.test(bulkZip.suggestedFilename()), 'Bulk ZIP export did not download a zip');

    // XLSX parse + Generate and Download
    await page.locator('#nav-bulk').click();
    await page.setInputFiles('#bulk-xl-inp', path.join(QA, 'bulk_cards.xlsx'));
    await page.waitForFunction(() => typeof bulkRows !== 'undefined' && bulkRows.length > 0);
    await page.evaluate(() => { mkFolder('QA Bulk XLSX'); refreshBulkFolders(); });
    await page.waitForFunction(() => {
      const sel = document.getElementById('bulk-fsel');
      return [...sel.options].some(o => o.textContent.includes('QA Bulk XLSX'));
    });
    await page.selectOption('#bulk-fsel', { label: 'QA Bulk XLSX' });

    const downloadsBeforeBulkDl = downloads.length;
    await page.locator('#gen-dl-btn').click();
    await waitForProgressDone(page, 'All');
    await waitForToast(page, 'generated, saved, and downloaded');
    await page.waitForTimeout(1500);
    const downloadsAfterBulkDl = downloads.length - downloadsBeforeBulkDl;
    assert(downloadsAfterBulkDl >= 2, 'Generate + Download did not trigger per-card downloads');

    // Library Download All zip
    await page.locator('#nav-editor').click();
    await page.locator('#rtab-library').click();
    const libZipPromise = page.waitForEvent('download');
    await page.locator('button', { hasText: 'Download All' }).click();
    const libZip = await libZipPromise;
    await libZip.saveAs(path.join(DOWNLOADS, libZip.suggestedFilename()));
    assert(/\.zip$/i.test(libZip.suggestedFilename()), 'Library Download All did not return zip');

    // Folder context download all cards
    await page.locator('.folder-hd').first().click({ button: 'right' });
    const folderDlBefore = downloads.length;
    await page.locator('#fctx .ctx-i', { hasText: 'Download All Cards' }).click();
    await page.waitForTimeout(3000);
    assert(downloads.length > folderDlBefore, 'Folder context download did not trigger downloads');

    // Multi-select + selected download
    await page.locator('#nav-editor').click();
    await page.locator('#rtab-library').click();
    await page.evaluate(() => {
      document.querySelectorAll('.folder-cards').forEach(el => el.classList.add('op'));
      document.querySelectorAll('.farr').forEach(el => el.classList.add('op'));
    });
    await page.locator('.ci').nth(0).click();
    await page.locator('.ci').nth(1).click({ modifiers: ['Control'] });
    const selectedCount = await page.locator('#sel-count').textContent();
    assert(selectedCount.trim() === '2', 'Ctrl multi-select did not select two cards');
    const selDlBefore = downloads.length;
    await page.locator('#sel-bar button', { hasText: 'Download' }).click();
    await page.waitForTimeout(3000);
    assert(downloads.length > selDlBefore, 'Selected cards download did not trigger');

    // Fix All smoke test
    await page.locator('#nav-editor').click();
    await page.locator('button', { hasText: 'Fix All' }).click();
    await page.waitForTimeout(500);

    libState = await readLibraryState(page);

    const results = {
      pageErrors,
      consoleErrors,
      httpErrors,
      downloads,
      dialogs,
      savedFolders: libState.folders.length,
      totalCards: libState.folders.reduce((sum, folder) => sum + folder.cards.length, 0),
      offerWidthDelta: labelWidths.delta
    };
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(err => {
  console.error('REGRESSION_FAILED');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
