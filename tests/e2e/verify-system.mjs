import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_DIR = join(ROOT_DIR, 'client');
const PREVIEW_PORT = Number(process.env.E2E_PORT || 4189);
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9231);
const BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
const CDP_HTTP = `http://127.0.0.1:${CDP_PORT}`;

const sleep = (ms) => new Promise((resolveFn) => setTimeout(resolveFn, ms));

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Waiting for startup
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getPageWsUrl() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${CDP_HTTP}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Waiting for Chromium CDP
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for Chromium CDP on ${CDP_HTTP}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.uncaughtErrors = [];
  }

  async connect() {
    await new Promise((resolveFn, rejectFn) => {
      this.ws.addEventListener('open', resolveFn, { once: true });
      this.ws.addEventListener('error', rejectFn, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data.toString());
      if (payload.id && this.pending.has(payload.id)) {
        const entry = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) entry.reject(new Error(JSON.stringify(payload.error)));
        else entry.resolve(payload.result);
        return;
      }
      if (payload.method === 'Runtime.exceptionThrown') {
        this.uncaughtErrors.push(
          payload.params?.exceptionDetails?.text ||
            JSON.stringify(payload.params?.exceptionDetails || 'Unknown exception'),
        );
      }
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveFn, rejectFn) => {
      this.pending.set(id, { resolve: resolveFn, reject: rejectFn });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async setViewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  }

  async navigate(path) {
    await this.send('Page.navigate', { url: `${BASE_URL}${path}` });
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const ready = await this.eval(
        `document.readyState === 'complete' && !document.body.innerText.includes('Завантаження робочого модуля...')`,
      );
      if (ready) break;
    }
    await sleep(250);
  }

  async pressKey(key, code = key) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: key === 'Escape' ? 27 : 0,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: key === 'Escape' ? 27 : 0,
    });
    await sleep(150);
  }

  async clickPoint(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await sleep(150);
  }

  async drag(x1, y1, x2, y2) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: x1,
      y: y1,
      button: 'left',
      clickCount: 1,
    });
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(x1 + ((x2 - x1) * i) / steps),
        y: Math.round(y1 + ((y2 - y1) * i) / steps),
        button: 'left',
      });
      await sleep(18);
    }
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: x2,
      y: y2,
      button: 'left',
      clickCount: 1,
    });
    await sleep(250);
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'logicforge-e2e-'));
  const viteProc = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort'],
    {
      cwd: CLIENT_DIR,
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, VITE_DISABLE_API_PROXY: 'true' },
    },
  );

  const chromeBin = process.env.CHROME_BIN || '/usr/sbin/chromium';
  const chromeProc = spawn(
    chromeBin,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore', detached: true },
  );

  let cdp = null;
  try {
    await waitForHttp(BASE_URL);
    const wsUrl = await getPageWsUrl();
    cdp = new CDPClient(wsUrl);
    await cdp.connect();

    // [1/8] Global Navbar consistency & compact page headers across desktop routes (Guest)
    await cdp.setViewport(1440, 900, false);
    for (const route of [
      '/',
      '/cabinet',
      '/editor/preset-ne555-jk',
      '/library',
      '/revisions/preset-full-adder',
      '/reports/preset-full-adder',
    ]) {
      await cdp.navigate(route);
      const navCheck = await cdp.eval(`(() => {
        const header = document.querySelector('header');
        const hRect = header ? header.getBoundingClientRect() : null;
        const svg = header?.querySelector('svg');
        const svgRect = svg ? svg.getBoundingClientRect() : null;
        const wrapRect = svg?.parentElement ? svg.parentElement.getBoundingClientRect() : null;
        const selectsInNav = header ? header.querySelectorAll('select').length : -1;
        const text = header ? header.innerText : '';
        const h1 = document.querySelector('h1');
        const hasBackLink = Array.from(document.querySelectorAll('a, button')).some((el) =>
          (el.textContent || '').includes('До редактора САПР')
        );
        return {
          navHeight: hRect ? Math.round(hRect.height) : 0,
          logoWidth: svgRect ? Math.round(svgRect.width) : 0,
          logoUnclipped: Boolean(
            svgRect && wrapRect && svgRect.left >= wrapRect.left && svgRect.right <= wrapRect.right
          ),
          selectsInNav,
          hasSimButton: text.includes('ЗАПУСТИТИ СИМУЛЯЦІЮ'),
          hasExeBanner: document.body.innerText.includes('LOGICFORGE.EXE'),
          hasBackLink,
          hasH1: Boolean(h1),
        };
      })()`);
      assert.ok(
        navCheck.navHeight > 28 && navCheck.navHeight <= 48,
        `Navbar height invalid on ${route}: ${navCheck.navHeight}`,
      );
      assert.ok(
        navCheck.logoWidth >= 26 && navCheck.logoUnclipped,
        `Logo SVG clipped on ${route}: width=${navCheck.logoWidth}`,
      );
      assert.equal(navCheck.selectsInNav, 0, `Navbar must not contain selects on ${route}`);
      assert.equal(navCheck.hasSimButton, false);
      assert.equal(navCheck.hasExeBanner, false);
      assert.equal(navCheck.hasBackLink, false);
      assert.equal(navCheck.hasH1, true, `Missing H1 on ${route}`);
    }
    console.log('PASS [1/8] Global single-row Navbar & compact page headers verified');

    // [2/8] Home page interactive demo & live NE555 simulation + Full Adder
    await cdp.navigate('/');
    const homeCheck = await cdp.eval(`(() => {
      const tabs = document.querySelectorAll('[role="tab"]');
      const quickStartHeadings = Array.from(document.querySelectorAll('h2')).map((h) => h.textContent?.trim());
      const waveWidths = Array.from(document.querySelectorAll('[data-testid="showcase-wave-svg"]'))
        .map((el) => Math.round(el.getBoundingClientRect().width));
      const leftPane = document.querySelector('[data-testid="home-scheme-pane"]')?.getBoundingClientRect().width || 0;
      const rightPane = document.querySelector('[data-testid="home-info-pane"]')?.getBoundingClientRect().width || 0;
      return {
        tabCount: tabs.length,
        hasStartPause: Boolean(document.querySelector('[data-testid="showcase-toggle-play"]')),
        hasStep: Boolean(document.querySelector('[data-testid="showcase-step"]')),
        hasReset: Boolean(document.querySelector('[data-testid="showcase-reset"]')),
        hasOpenEditor: Boolean(document.querySelector('[data-testid="showcase-open-editor"]')),
        quickStartHeadings,
        waveWidths,
        paneRatio: rightPane > 0 ? leftPane / rightPane : 0,
        hasRawUnderscoreMath: /\\b(t_pd|T_crit|f_max)\\b/.test(document.body.innerText),
        hasIeeeText: document.body.innerText.includes('IEEE'),
      };
    })()`);
    assert.equal(homeCheck.tabCount, 4);
    assert.ok(
      homeCheck.paneRatio >= 1.35 && homeCheck.paneRatio <= 1.65,
      `Home showcase must use 60:40 split (~1.5), got ratio=${homeCheck.paneRatio.toFixed(2)}`,
    );
    assert.ok(
      homeCheck.hasStartPause && homeCheck.hasStep && homeCheck.hasReset && homeCheck.hasOpenEditor,
    );
    assert.ok(homeCheck.waveWidths.length >= 2);
    assert.ok(
      homeCheck.waveWidths.every((w) => Math.abs(w - homeCheck.waveWidths[0]) <= 1),
      `Oscilloscope signal lanes must have equal synchronized width: ${homeCheck.waveWidths.join(', ')}`,
    );
    assert.equal(
      homeCheck.hasRawUnderscoreMath,
      false,
      'Math formulas must render as subscripts, not raw underscores',
    );
    assert.equal(homeCheck.hasIeeeText, false, 'Redundant IEEE text must not appear on Home');
    assert.ok(homeCheck.quickStartHeadings.includes('Схемотехнічний редактор'));
    assert.ok(homeCheck.quickStartHeadings.includes('Бібліотека 37 ІМС'));
    assert.ok(homeCheck.quickStartHeadings.includes('Інженерні звіти та ДДНФ'));

    const homeCanvasZoomCheck = await cdp.eval(`(() => {
      const svg = document.querySelector('[data-testid="circuit-canvas"]');
      const wrap = svg?.parentElement;
      const beforeZoom = document.querySelector('[data-testid="canvas-zoom-label"]')?.textContent || '';
      const ev = new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, cancelable: true, bubbles: true, clientX: 300, clientY: 300 });
      svg?.dispatchEvent(ev);
      return {
        wireSquareBadges: document.querySelectorAll('[data-edge-id] rect, [data-edge-id] text').length,
        touchAction: wrap ? getComputedStyle(wrap).touchAction : '',
        ctrlWheelPrevented: ev.defaultPrevented,
        beforeZoom,
      };
    })()`);
    await sleep(60);
    const homeAfterZoom = await cdp.eval(
      `document.querySelector('[data-testid="canvas-zoom-label"]')?.textContent || ''`,
    );
    assert.equal(
      homeCanvasZoomCheck.wireSquareBadges,
      0,
      'Wires must NOT render 0/1 square badges',
    );
    assert.equal(
      homeCanvasZoomCheck.touchAction,
      'none',
      'Home demo canvas must lock touch-action',
    );
    assert.equal(
      homeCanvasZoomCheck.ctrlWheelPrevented,
      true,
      'Pinch ctrl+wheel must be intercepted',
    );
    assert.notEqual(
      homeAfterZoom,
      homeCanvasZoomCheck.beforeZoom,
      'Home demo canvas zoom must update without page zoom',
    );
    await cdp.eval(`document.querySelector('[data-testid="canvas-zoom-reset"]')?.click()`);
    await sleep(50);

    const ne555States = new Set();
    for (let i = 0; i < 6; i++) {
      await cdp.eval(`document.querySelector('[data-testid="showcase-step"]')?.click()`);
      await sleep(80);
      const outText = await cdp.eval(`(() => {
        const badges = Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.includes('PULSE_555') && d.className.includes('win95-statusbar-cell'));
        return badges ? badges.innerText.trim() : '';
      })()`);
      ne555States.add(outText);
    }
    assert.ok(ne555States.size >= 2, `NE555 output must toggle on Home steps`);

    await cdp.eval(
      `document.querySelector('[data-testid="showcase-preset-preset-full-adder"]')?.click()`,
    );
    await sleep(180);
    assert.ok(
      await cdp.eval(
        `document.body.innerText.toLowerCase().includes('повний') && document.body.innerText.includes('SUM')`,
      ),
    );
    console.log('PASS [2/8] Home interactive live demo & NE555 oscillation verified');

    // [3/8] Component Library cards, radial LED & DIP graphics, and Single-Close accessible Modal
    await cdp.navigate('/library');
    const libCheck = await cdp.eval(`(() => {
      const cardTables = document.querySelectorAll('article table').length;
      const specButtons = Array.from(document.querySelectorAll('article button')).filter((b) =>
        (b.textContent || '').includes('Специфікація та таблиця істинності')
      );
      const ledGrad = Boolean(document.querySelector('radialGradient[id^="led-grad-"]'));
      const switchUsesCanvasUi = Boolean(
        document.querySelector('[data-testid="preview-symbol-INPUT_SWITCH"] [data-testid^="switch-toggle-"]'),
      );
      const hasGuestCustomIcSection = Boolean(document.querySelector('[data-testid="custom-ics-section"]'));
      return { cardTables, cardButtonCount: specButtons.length, ledGrad, switchUsesCanvasUi, hasGuestCustomIcSection };
    })()`);
    assert.equal(libCheck.cardTables, 0);
    assert.equal(libCheck.cardButtonCount, 37);
    assert.equal(libCheck.ledGrad, true, 'LED radial gradient highlight missing on catalog cards');
    assert.equal(
      libCheck.switchUsesCanvasUi,
      true,
      'Catalog card icon for switch must match exact canvas 3D switch component',
    );
    assert.equal(
      libCheck.hasGuestCustomIcSection,
      false,
      'Guests must not see user-owned Custom ICs in Library',
    );

    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('article button')).find((b) =>
        (b.textContent || '').includes('Специфікація та таблиця істинності')
      );
      window.__libTrigger = btn;
      btn.focus();
      btn.click();
    })()`);
    await sleep(200);

    const modalCheck = await cdp.eval(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const closeButtons = dialog.querySelectorAll('[aria-label="Закрити діалогове вікно"]').length;
      const duplicateDismissBtns = Array.from(dialog.querySelectorAll('button')).filter((b) =>
        ['Закрити', 'Готово', 'Скасувати'].includes((b.textContent || '').trim())
      ).length;
      const modalTables = dialog.querySelectorAll('table').length;
      const outputHeaderBg = getComputedStyle(dialog.querySelector('table th') || dialog).backgroundColor;
      return {
        ariaModal: dialog.getAttribute('aria-modal'),
        focusInside: dialog.contains(document.activeElement),
        closeButtons,
        duplicateDismissBtns,
        modalTables,
        outputHeaderBg,
        hasTruthTitle: dialog.innerText.toUpperCase().includes('ТАБЛИЦЯ ІСТИННОСТІ'),
        hasIeeeInModal: dialog.innerText.includes('IEEE'),
      };
    })()`);
    assert.ok(modalCheck);
    assert.equal(modalCheck.ariaModal, 'true');
    assert.equal(modalCheck.focusInside, true);
    assert.equal(modalCheck.closeButtons, 1);
    assert.equal(modalCheck.duplicateDismissBtns, 0);
    assert.ok(modalCheck.modalTables >= 1);
    assert.equal(
      modalCheck.hasTruthTitle,
      true,
      'Truth table box must be titled ТАБЛИЦЯ ІСТИННОСТІ',
    );
    assert.equal(modalCheck.hasIeeeInModal, false, 'Component modal must not display IEEE text');

    await cdp.pressKey('Escape');
    const afterEsc = await cdp.eval(`({
      open: Boolean(document.querySelector('[role="dialog"]')),
      focusRestored: document.activeElement === window.__libTrigger
    })`);
    assert.equal(afterEsc.open, false);
    assert.equal(afterEsc.focusRestored, true);

    // Verify full 16-row (2^4) truth table in SEVEN_SEGMENT specification modal
    await cdp.eval(`(() => {
      const card = document.querySelector('[data-testid="preview-symbol-SEVEN_SEGMENT"]')?.closest('article');
      card?.querySelector('button')?.click();
    })()`);
    await sleep(200);
    const hexModalCheck = await cdp.eval(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const tables = dialog ? Array.from(dialog.querySelectorAll('table')) : [];
      const truthTable = tables[tables.length - 1];
      const truthRows = truthTable ? truthTable.querySelectorAll('tbody tr').length : 0;
      return {
        open: Boolean(dialog),
        hasCount16: Boolean(dialog && dialog.innerText.includes('Рядків: 16')),
        hasHex0: Boolean(dialog && dialog.innerText.includes('0x0')),
        hasHexF: Boolean(dialog && dialog.innerText.includes('0xF')),
        truthRows,
      };
    })()`);
    assert.equal(hexModalCheck.open, true);
    assert.equal(
      hexModalCheck.hasCount16,
      true,
      'SEVEN_SEGMENT truth table must show all 16 rows (2^4)',
    );
    assert.equal(hexModalCheck.truthRows, 16, 'SEVEN_SEGMENT truth table DOM must contain 16 rows');
    assert.ok(hexModalCheck.hasHex0 && hexModalCheck.hasHexF);
    await cdp.pressKey('Escape');
    await sleep(100);
    console.log('PASS [3/8] Component Library CAD symbols & Single-Close Modal verified');

    // [4/8] "+ Нова схема" Dialog (Empty vs Template + Name) & Single Editor Win95Dropdown Switcher
    await cdp.eval(`document.querySelector('[data-testid="navbar-new-btn"]')?.click()`);
    await sleep(200);
    const newSchemeDialog = await cdp.eval(`({
      hasEmptyMode: Boolean(document.querySelector('[data-testid="new-scheme-mode-empty"]')),
      hasTemplateMode: Boolean(document.querySelector('[data-testid="new-scheme-mode-template"]')),
      hasNameInput: Boolean(document.querySelector('[data-testid="new-scheme-name-input"]')),
      closeBtns: document.querySelectorAll('[role="dialog"] [aria-label="Закрити діалогове вікно"]').length
    })`);
    assert.ok(
      newSchemeDialog.hasEmptyMode &&
        newSchemeDialog.hasTemplateMode &&
        newSchemeDialog.hasNameInput,
    );
    assert.equal(newSchemeDialog.closeBtns, 1);

    // Create genuinely EMPTY scheme with custom name & custom description
    await cdp.eval(`(() => {
      const inp = document.querySelector('[data-testid="new-scheme-name-input"]');
      const desc = document.querySelector('[data-testid="new-scheme-description-input"]');
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSet.call(inp, 'Чиста схема тесту');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      if (desc) {
        nativeSet.call(desc, 'Власний інженерний опис перевірочної схеми');
        desc.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await cdp.eval(`document.querySelector('[data-testid="btn-confirm-create-scheme"]')?.click()`);
    await sleep(350);

    const emptyCreated = await cdp.eval(`({
      path: window.location.pathname,
      hasOldTitleInput: Boolean(document.querySelector('[data-testid="editor-title-input"]')),
      hasSingleDropdown: Boolean(document.querySelector('[data-testid="editor-circuit-select"]')),
      hasRenameBtn: Boolean(document.querySelector('[data-testid="btn-rename-scheme"]')),
      dropdownText: document.querySelector('[data-testid="editor-circuit-select"]')?.innerText.trim() || '',
      nodeCount: document.querySelectorAll('[data-testid="circuit-canvas"] [data-node-id]').length,
    })`);
    assert.ok(emptyCreated.path.startsWith('/editor/draft-'));
    assert.equal(emptyCreated.hasOldTitleInput, false, 'Duplicate title input must NOT exist');
    assert.equal(emptyCreated.hasSingleDropdown, true);
    assert.equal(emptyCreated.hasRenameBtn, true);
    assert.ok(emptyCreated.dropdownText.includes('Чиста схема тесту'));
    assert.equal(emptyCreated.nodeCount, 0, 'Empty new scheme must start with 0 nodes');

    // Open scheme properties/description modal and confirm description persisted
    await cdp.eval(`document.querySelector('[data-testid="btn-rename-scheme"]')?.click()`);
    await sleep(120);
    const propsModalCheck = await cdp.eval(`({
      descVal: document.querySelector('[data-testid="editor-description-input"]')?.value || '',
      hasCategoryDropdown: Boolean(document.querySelector('[data-testid="editor-scheme-category-select"]')),
    })`);
    await cdp.pressKey('Escape');
    assert.equal(
      propsModalCheck.descVal,
      'Власний інженерний опис перевірочної схеми',
      'New scheme must keep custom description',
    );
    assert.equal(propsModalCheck.hasCategoryDropdown, true);

    // Open custom Win95Dropdown & verify 0px sharp popup panel + switch via template click
    await cdp.eval(`document.querySelector('[data-testid="editor-circuit-select"]')?.click()`);
    await sleep(120);
    const popupCheck = await cdp.eval(`(() => {
      const lb = document.querySelector('[role="listbox"]');
      if (!lb) return null;
      const st = getComputedStyle(lb);
      return {
        borderRadius: st.borderRadius,
        bgColor: st.backgroundColor,
        optionCount: lb.querySelectorAll('[role="option"]').length,
        hasUserSchemesGroup: lb.innerText.includes('Мої схеми'),
      };
    })()`);
    assert.ok(popupCheck, 'Custom Win95Dropdown listbox did not open');
    assert.equal(popupCheck.borderRadius, '0px');
    assert.equal(popupCheck.bgColor, 'rgb(255, 255, 255)');
    assert.equal(
      popupCheck.hasUserSchemesGroup,
      false,
      'Guests must NOT see user-owned schemes group in Editor switcher',
    );
    assert.ok(popupCheck.optionCount >= 8);
    await cdp.eval(
      `document.querySelector('[role="option"][data-option-value="preset-ne555-jk"]')?.click()`,
    );
    await sleep(350);
    console.log('PASS [4/8] New Scheme Modal (Empty & Template) + Single Win95Dropdown verified');

    // [5/8] Guest Auth Gating + Login Flow + Unlocked Cabinet & Revisions
    // While guest (!user), Editor Save & Custom IC show Auth Required gate
    await cdp.eval(`document.querySelector('[data-testid="btn-save-revision"]')?.click()`);
    await sleep(150);
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[data-testid="editor-auth-gate-dialog"]'))`),
      true,
      'Guests must be prompted to sign in before saving revisions',
    );
    await cdp.pressKey('Escape');

    await cdp.navigate('/reports/preset-full-adder');
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[data-testid="reports-guest-banner"]'))`),
      true,
      'Guests must see restricted export notice on ReportsPage',
    );
    await cdp.eval(`document.querySelector('[data-testid="btn-export-bom"]')?.click()`);
    await sleep(150);
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[data-testid="reports-auth-gate-dialog"]'))`),
      true,
      'Guests clicking BOM CSV export must see auth gate modal',
    );
    await cdp.pressKey('Escape');
    await sleep(100);
    await cdp.eval(`document.querySelector('[data-testid="btn-print-pdf"]')?.click()`);
    await sleep(150);
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[data-testid="reports-auth-gate-dialog"]'))`),
      true,
      'Guests clicking Print/PDF export must see auth gate modal',
    );
    await cdp.pressKey('Escape');
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    const guestPrintAudit = await cdp.eval(`(() => ({
      sheetDisplay: getComputedStyle(document.querySelector('.print-cad-sheet')).display,
      noticeDisplay: getComputedStyle(document.querySelector('[data-testid="print-auth-notice"]')).display,
    }))()`);
    await cdp.send('Emulation.setEmulatedMedia', { media: '' });
    assert.equal(
      guestPrintAudit.sheetDisplay,
      'none',
      'Guest print stylesheet must hide CAD sheet',
    );
    assert.notEqual(
      guestPrintAudit.noticeDisplay,
      'none',
      'Guest print stylesheet must display auth-required print block',
    );

    await cdp.navigate('/revisions/preset-full-adder');
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[data-testid="auth-required-gate"]'))`),
      true,
      'Guests must see auth gate on RevisionHistoryPage',
    );
    await cdp.navigate('/cabinet');
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[data-testid="auth-required-gate"]'))`),
      true,
      'Guests must see auth gate on CabinetPage',
    );

    // Register validation & visual Win95 red invalid fields check before Login
    await cdp.navigate('/register');
    const regMeta = await cdp.eval(`({
      hasOldName: document.body.innerHTML.includes('Самець'),
      hasSubtitle: document.body.innerText.includes('Особистий кабінет • Збереження проєктів'),
      hasShevchenkoPlaceholder: Boolean(document.querySelector('input[placeholder="Шевченко Іван"]')),
    })`);
    assert.equal(regMeta.hasOldName, false, 'Removed placeholder name must not appear');
    assert.equal(regMeta.hasSubtitle, false, 'Removed header subtitle text must not appear');
    assert.equal(regMeta.hasShevchenkoPlaceholder, true);

    await cdp.eval(`(() => {
      const emailInput = document.querySelector('input[type="email"]');
      const userInput = document.querySelector('input[autocomplete="username"]');
      const nameInput = document.querySelector('input[autocomplete="name"]');
      const passInput = document.querySelector('input[type="password"]');
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSet.call(emailInput, 'bad-email');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSet.call(userInput, 'ab');
      userInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSet.call(nameInput, 'А');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSet.call(passInput, '123');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await cdp.eval(`document.querySelector('[data-testid="auth-submit-btn"]')?.click()`);
    await sleep(150);
    const valAudit = await cdp.eval(`(() => {
      const panel = document.querySelector('[data-testid="auth-error-panel"]');
      const redInputs = Array.from(document.querySelectorAll('input.win95-field-error'));
      const firstBg = redInputs[0] ? getComputedStyle(redInputs[0]).backgroundColor : '';
      return {
        hasPanel: Boolean(panel),
        hasStopSvg: Boolean(panel?.querySelector('svg circle')),
        redCount: redInputs.length,
        firstBg,
      };
    })()`);
    assert.equal(valAudit.hasPanel, true, 'Validation must show graphical Win95 error panel');
    assert.equal(valAudit.hasStopSvg, true, 'Validation panel must render Win95 stop graphic');
    assert.equal(valAudit.redCount, 4, 'All 4 invalid register inputs must be highlighted red');
    assert.equal(valAudit.firstBg, 'rgb(255, 242, 242)', 'Invalid input must turn red (#fff2f2)');

    // Log in cleanly via /login form (works online & in standalone offline preview)
    await cdp.navigate('/login');
    await cdp.eval(`(() => {
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSet.call(emailInput, 'student@lpnu.ua');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeSet.call(passInput, 'DemoPass123!');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await cdp.eval(`document.querySelector('[data-testid="auth-submit-btn"]')?.click()`);
    for (let i = 0; i < 25; i++) {
      await sleep(120);
      const currentPath = await cdp.eval(`window.location.pathname`);
      if (currentPath === '/cabinet') break;
    }
    await sleep(200);

    // Cabinet now unlocked: clone & delete cleanly
    const cabUnlocked = await cdp.eval(`({
      path: window.location.pathname,
      hasGate: Boolean(document.querySelector('[data-testid="auth-required-gate"]')),
      hasClone: document.body.innerText.includes('Клонувати'),
    })`);
    assert.equal(cabUnlocked.path, '/cabinet', 'Submitting login form should redirect to /cabinet');
    assert.equal(cabUnlocked.hasGate, false);
    assert.equal(cabUnlocked.hasClone, true);
    await cdp.eval(`(() => {
      const cloneBtn = Array.from(document.querySelectorAll('article button')).find((b) =>
        (b.textContent || '').includes('Клонувати')
      );
      cloneBtn?.click();
    })()`);
    await sleep(250);
    await cdp.eval(`(() => {
      const delBtn = Array.from(document.querySelectorAll('article button')).find((b) =>
        (b.getAttribute('aria-label') || '').includes('Видалити')
      );
      delBtn?.click();
    })()`);
    await sleep(150);
    await cdp.eval(`(() => {
      const confirmBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
        (b.textContent || '').includes('Видалити остаточно')
      );
      confirmBtn?.click();
    })()`);
    await sleep(200);

    // Custom IC flow: create from circuit -> edit metadata in Cabinet -> open IC internal schema -> update IC
    await cdp.navigate('/editor/preset-full-adder');
    await cdp.eval(`document.querySelector('[data-testid="btn-custom-ic"]')?.click()`);
    await sleep(150);
    await cdp.eval(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const nameInp = dialog.querySelector('input[id$="-ic-name"]');
      const codeInp = dialog.querySelector('input[id$="-ic-code"]');
      if (nameInp) {
        nativeSet.call(nameInp, 'Півсуматор 1-бітний');
        nameInp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (codeInp) {
        nativeSet.call(codeInp, 'HA_1BIT');
        codeInp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await sleep(80);
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
        (b.textContent || '').includes('Створити мікросхему')
      );
      btn?.click();
    })()`);
    await sleep(250);
    const createdCustomIcCheck = await cdp.eval(`({
      dialogStillOpen: Boolean(document.querySelector('[role="dialog"]')),
      storedRaw: localStorage.getItem('logicforge_custom_ics_v1') || '',
    })`);
    assert.equal(
      createdCustomIcCheck.dialogStillOpen,
      false,
      'Custom IC creation modal should close',
    );
    assert.ok(
      createdCustomIcCheck.storedRaw.includes('HA_1BIT'),
      'Created custom IC HA_1BIT must be saved',
    );

    await cdp.navigate('/cabinet');
    await cdp.eval(`document.querySelector('[data-testid="tab-custom-ics"]')?.click()`);
    await sleep(150);
    const customIcTabState = await cdp.eval(`({
      hasCode: document.body.innerText.includes('HA_1BIT'),
      hasEditBtn: Boolean(document.querySelector('[data-testid^="btn-edit-custom-ic-"]')),
      hasSchemaBtn: Boolean(document.querySelector('[data-testid^="btn-open-custom-ic-schema-"]')),
    })`);
    assert.equal(customIcTabState.hasCode, true, 'Cabinet custom ICs tab must show HA_1BIT');
    assert.equal(customIcTabState.hasEditBtn, true, 'Custom IC card must render Редагувати button');
    assert.equal(
      customIcTabState.hasSchemaBtn,
      true,
      'Custom IC card must render Схема ІМС button',
    );

    await cdp.eval(`document.querySelector('[data-testid^="btn-edit-custom-ic-"]')?.click()`);
    await sleep(150);
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[data-testid="edit-custom-ic-modal"]'))`),
      true,
      'Clicking Редагувати must open Edit Custom IC modal',
    );
    await cdp.eval(`(() => {
      const setInp = (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const nativeSet = Object.getOwnPropertyDescriptor(proto, 'value').set;
        nativeSet.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setInp('[data-testid="edit-ic-name-input"]', 'Оновлений півсуматор IC');
      setInp('[data-testid="edit-ic-code-input"]', 'HA_EDITED');
      setInp('[data-testid="edit-ic-desc-input"]', 'Оновлений інженерний опис ІМС');
    })()`);
    await sleep(80);
    await cdp.eval(`document.querySelector('[data-testid="btn-save-custom-ic-edit"]')?.click()`);
    await sleep(200);
    const editedCustomIcState = await cdp.eval(`({
      modalStillOpen: Boolean(document.querySelector('[data-testid="edit-custom-ic-modal"]')),
      bodyText: document.body.innerText,
    })`);
    assert.equal(
      editedCustomIcState.modalStillOpen,
      false,
      'Edit Custom IC modal should close on save',
    );
    assert.ok(
      editedCustomIcState.bodyText.includes('Оновлений півсуматор IC') &&
        editedCustomIcState.bodyText.includes('HA_EDITED'),
      'Updated custom IC name and code must appear in Cabinet card',
    );

    await cdp.eval(
      `document.querySelector('[data-testid^="btn-open-custom-ic-schema-"]')?.click()`,
    );
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      const p = await cdp.eval(`window.location.pathname`);
      if (p.startsWith('/editor/draft-ic-')) break;
    }
    await sleep(200);
    const icEditorState = await cdp.eval(`({
      path: window.location.pathname,
      nodeCount: document.querySelectorAll('[data-testid="circuit-canvas"] [data-node-id]').length,
    })`);
    assert.ok(
      icEditorState.path.startsWith('/editor/draft-ic-'),
      `Opening IC schema must navigate to /editor/draft-ic-..., got: ${icEditorState.path}`,
    );
    assert.ok(
      icEditorState.nodeCount >= 5,
      `Custom IC internal circuit must load nodes in editor, got: ${icEditorState.nodeCount}`,
    );

    await cdp.eval(`document.querySelector('[data-testid="btn-custom-ic"]')?.click()`);
    await sleep(150);
    const updateIcModalState = await cdp.eval(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const updateBtn = Array.from(dialog?.querySelectorAll('button') || []).find((b) =>
        (b.textContent || '').includes('Оновити «HA_EDITED»')
      );
      return {
        hasUpdateBtn: Boolean(updateBtn),
        nameLen: (dialog?.querySelector('input[id$="-ic-name"]')?.value || '').trim().length,
        codeLen: (dialog?.querySelector('input[id$="-ic-code"]')?.value || '').trim().length,
      };
    })()`);
    assert.equal(
      updateIcModalState.hasUpdateBtn,
      true,
      'Custom IC editor must offer Оновити «HA_EDITED» action',
    );
    assert.ok(updateIcModalState.nameLen >= 2 && updateIcModalState.codeLen >= 2);
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
        (b.textContent || '').includes('Оновити «HA_EDITED»')
      );
      btn?.click();
    })()`);
    await sleep(200);
    assert.equal(
      await cdp.eval(`Boolean(document.querySelector('[role="dialog"]'))`),
      false,
      'Updating existing custom IC from editor should close modal cleanly',
    );

    // Revisions now unlocked: check summary panel + restore flow
    await cdp.navigate('/revisions/preset-full-adder');
    const revUnlocked = await cdp.eval(`(() => {
      const panel = document.querySelector('[data-testid="revision-summary-panel"]');
      const btn = document.querySelector('[data-testid="btn-restore-revision"]');
      return {
        hasPanel: Boolean(panel),
        disabledInputs: panel ? panel.querySelectorAll('input:disabled, select:disabled').length : -1,
        restoreDisabled: btn ? btn.disabled : true,
      };
    })()`);
    assert.equal(revUnlocked.hasPanel, true);
    assert.equal(revUnlocked.disabledInputs, 0);
    assert.equal(revUnlocked.restoreDisabled, false);
    await cdp.eval(`document.querySelector('[data-testid="btn-restore-revision"]')?.click()`);
    await sleep(150);
    await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
        (b.textContent || '').includes('Відновити v')
      );
      btn?.click();
    })()`);
    await sleep(300);
    assert.ok((await cdp.eval(`window.location.pathname`)).startsWith('/editor/preset-full-adder'));
    console.log('PASS [5/8] Guest auth restriction + authenticated Cabinet & Revisions verified');

    // [6/8] Editor Contextual Inspector, Drag Opacity & Overlap Warning, NE555 & Oscilloscope Non-Overlap
    await cdp.navigate('/editor/preset-ne555-jk');
    assert.equal(
      await cdp.eval(
        `Boolean(document.querySelector('[data-testid="inspector-circuit-overview"]'))`,
      ),
      true,
    );

    // Drag n_555 directly over n_jk and verify opacity < 1 + overlap badge while dragging
    const dragCoords = await cdp.eval(`(() => {
      const a = document.querySelector('[data-node-id="n_555"]');
      const b = document.querySelector('[data-node-id="n_jk"]');
      if (!a || !b) return null;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return {
        ax: Math.round(ra.left + ra.width / 2),
        ay: Math.round(ra.top + ra.height / 2),
        bx: Math.round(rb.left + rb.width / 2),
        by: Math.round(rb.top + rb.height / 2),
      };
    })()`);
    assert.ok(dragCoords, 'Missing drag nodes on NE555 canvas');
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: dragCoords.ax,
      y: dragCoords.ay,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: dragCoords.ax,
      y: dragCoords.ay,
      button: 'left',
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: dragCoords.bx,
      y: dragCoords.by,
      button: 'left',
    });
    await sleep(120);
    const dragVisualState = await cdp.eval(`(() => {
      const edgePaths = Array.from(document.querySelectorAll('[data-edge-id] path[stroke]:not([stroke="transparent"])'))
        .map((p) => p.getAttribute('d') || '');
      const junctionCount = document.querySelectorAll('[data-testid="wire-junction-dot"]').length;
      const wireSquareBadges = document.querySelectorAll('[data-edge-id] rect, [data-edge-id] text').length;
      const wheelEv = new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, cancelable: true, bubbles: true, clientX: 400, clientY: 350 });
      document.querySelector('[data-testid="circuit-canvas"]')?.dispatchEvent(wheelEv);
      return {
        hasTranslucentNode: Boolean(document.querySelector('g[opacity="0.68"]')),
        hasOverlapBadge: Boolean(document.querySelector('[data-testid="overlap-warning-badge"]')),
        hasCurveWires: edgePaths.some((d) => d.includes(' C ')),
        edgeCount: edgePaths.length,
        junctionCount,
        wireSquareBadges,
        editorPinchPrevented: wheelEv.defaultPrevented,
      };
    })()`);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: dragCoords.ax,
      y: dragCoords.ay,
      button: 'left',
      clickCount: 1,
    });
    await sleep(150);
    assert.equal(
      dragVisualState.hasTranslucentNode,
      true,
      'Dragged node must render semi-transparent',
    );
    assert.equal(dragVisualState.hasOverlapBadge, false, 'Overlap warning badge must NOT appear');
    assert.ok(dragVisualState.edgeCount >= 1);
    assert.equal(
      dragVisualState.wireSquareBadges,
      0,
      'Editor wires must NOT display 0/1 square boxes',
    );
    assert.equal(
      dragVisualState.editorPinchPrevented,
      true,
      'Editor canvas must intercept pinch/ctrl+wheel gestures locally',
    );
    assert.ok(
      dragVisualState.junctionCount >= 2,
      'Connected T-junction branches on NE555/VCC must display solder junction dots',
    );
    assert.equal(
      dragVisualState.hasCurveWires,
      false,
      'Circuit wires must use straight orthogonal CAD segments without Bezier curves',
    );

    // Smooth canvas viewport panning with open ComponentPaletteSidebar
    const panSetup = await cdp.eval(`(() => {
      const svg = document.querySelector('[data-testid="circuit-canvas"]');
      const g = svg?.querySelector('g[transform]');
      const paletteCount = document.querySelectorAll('[data-testid^="palette-item-"]').length;
      if (!svg || !g) return null;
      const rect = svg.getBoundingClientRect();
      return {
        paletteCount,
        startX: Math.round(rect.left + rect.width - 40),
        startY: Math.round(rect.top + 40),
        initialTransform: g.getAttribute('transform') || '',
      };
    })()`);
    assert.ok(panSetup && panSetup.paletteCount === 37, 'Component palette must be open during pan check');
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: panSetup.startX,
      y: panSetup.startY,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: panSetup.startX,
      y: panSetup.startY,
      button: 'left',
      clickCount: 1,
    });
    for (const step of [1, 2, 3]) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: panSetup.startX + step * 30,
        y: panSetup.startY + step * 15,
        button: 'left',
      });
      await sleep(25);
    }
    const midPanTransform = await cdp.eval(
      `document.querySelector('[data-testid="circuit-canvas"] g[transform]')?.getAttribute('transform') || ''`,
    );
    assert.notEqual(
      midPanTransform,
      panSetup.initialTransform,
      'Viewport transform must update smoothly via rAF while panning with open palette',
    );
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: panSetup.startX + 90,
      y: panSetup.startY + 45,
      button: 'left',
      clickCount: 1,
    });
    await sleep(80);
    const finalPanTransform = await cdp.eval(
      `document.querySelector('[data-testid="circuit-canvas"] g[transform]')?.getAttribute('transform') || ''`,
    );
    assert.equal(
      finalPanTransform,
      midPanTransform,
      'Committed viewport pan transform after mouseReleased must match live rAF preview without flicker',
    );

    // Reset clears Logic Analyzer empty -> clicking Start immediately captures new signals
    await cdp.eval(`document.querySelector('[data-testid="btn-reset"]')?.click()`);
    await sleep(150);
    const resetWaveState = await cdp.eval(`({
      hasEmpty: Boolean(document.querySelector('[data-testid="waveform-empty-state"]')),
      hasSvg: Boolean(document.querySelector('[data-testid="waveform-svg"]')),
    })`);
    assert.equal(resetWaveState.hasEmpty, true, 'Reset must empty the Logic Analyzer');
    assert.equal(resetWaveState.hasSvg, false, 'Waveform SVG must not render while reset empty');

    await cdp.eval(`document.querySelector('[data-testid="btn-toggle-run"]')?.click()`);
    await sleep(320);
    await cdp.eval(`document.querySelector('[data-testid="btn-toggle-run"]')?.click()`);
    await sleep(120);

    for (const width of [1440, 1280]) {
      await cdp.setViewport(width, 860, false);
      await sleep(220);
      const waveAudit = await cdp.eval(`(() => {
        const svg = document.querySelector('[data-testid="waveform-svg"]');
        if (!svg) return null;
        const sRect = svg.getBoundingClientRect();
        const texts = Array.from(svg.querySelectorAll('text')).map((t) => {
          const r = t.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top };
        });
        let overlaps = 0;
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i];
            const b = texts[j];
            if (Math.abs(a.top - b.top) < 8 && !(a.right + 1 < b.left || b.right + 1 < a.left)) {
              overlaps++;
            }
          }
        }
        const maxRight = texts.reduce((m, t) => Math.max(m, t.right), 0);
        const vpEl = svg.parentElement;
        const vpClientW = vpEl ? vpEl.clientWidth : 0;
        const hasDotGridInAnalyzer = Boolean(
          svg.closest('[data-testid="editor-analyzer-dock"], section')?.querySelector('.cad-grid-bg'),
        );
        const editorNativeSelects = document.querySelectorAll('select').length;
        const hasFollowBtn = Boolean(document.querySelector('[data-testid="waveform-follow-toggle"]'));
        const hasSpeedSelect = Boolean(document.querySelector('[data-testid="editor-speed-select"]'));
        const hasCentralWorkspaceText = document.body.innerText.includes('CENTRAL WORKSPACE');
        const mixedTitlebarFonts = Array.from(document.querySelectorAll('.win95-titlebar .font-mono')).length;
        const waveStrokes = Array.from(svg.querySelectorAll('path[d]')).map((p) =>
          p.getAttribute('stroke'),
        );
        return {
          count: texts.length,
          overlaps,
          clippedRight: maxRight > sRect.right + 2,
          fillsViewportWidth: vpClientW > 400 && sRect.width >= vpClientW - 2,
          svgFill: vpEl ? getComputedStyle(vpEl).backgroundColor : '',
          hasDotGridInAnalyzer,
          editorNativeSelects,
          hasFollowBtn,
          hasSpeedSelect,
          hasCentralWorkspaceText,
          mixedTitlebarFonts,
          waveStrokes,
        };
      })()`);
      assert.ok(waveAudit && waveAudit.count >= 2);
      assert.equal(waveAudit.overlaps, 0, `Oscilloscope tick overlap at ${width}px`);
      assert.equal(waveAudit.clippedRight, false, `Rightmost tick clipped at ${width}px`);
      assert.equal(
        waveAudit.fillsViewportWidth,
        true,
        `Waveform SVG must fill analyzer width at ${width}px`,
      );
      assert.equal(
        waveAudit.svgFill,
        'rgb(255, 255, 255)',
        'Logic analyzer background must use clean white Win95/Saleae theme (#ffffff)',
      );
      assert.equal(waveAudit.hasFollowBtn, true, 'Analyzer must render signal follow lock toggle');
      assert.equal(waveAudit.hasSpeedSelect, true, 'Editor must expose simulation speed selector');
      assert.equal(
        waveAudit.hasCentralWorkspaceText,
        false,
        'English CENTRAL WORKSPACE label must be removed',
      );
      assert.equal(
        waveAudit.mixedTitlebarFonts,
        0,
        'Win95 titlebars must use uniform font without font-mono spans',
      );
      assert.ok(
        waveAudit.waveStrokes.length >= 2 && waveAudit.waveStrokes.every((s) => s === '#000000'),
        `Every signal waveform trace must be black (#000000), got: ${waveAudit.waveStrokes.join(', ')}`,
      );
      assert.equal(
        waveAudit.hasDotGridInAnalyzer,
        false,
        'Dot grid must only exist in main schematic canvas, never in logic analyzer',
      );
      assert.equal(
        waveAudit.editorNativeSelects,
        0,
        'Editor must replace all native <select> elements with Win95Dropdown',
      );
    }
    console.log('PASS [6/8] Drag opacity/overlap warning, inspector & waveform ticks verified');

    // Verify clean Ukrainian button/panel names + LaTeX DNF rendering in Editor Truth Table modal
    const editorUiAudit = await cdp.eval(`(() => ({
      resetText: document.querySelector('[data-testid="btn-reset"]')?.textContent?.trim(),
      customIcText: document.querySelector('[data-testid="btn-custom-ic"]')?.textContent?.trim(),
      analyzerTitle: document.querySelector('[data-testid="signals-window"] .win95-titlebar')?.innerText || '',
      hasOldPaletteWord: Array.from(document.querySelectorAll('button')).some((b) => (b.textContent || '').includes('Палітра')),
      hasLibraryToggle: Array.from(document.querySelectorAll('button')).some((b) => (b.textContent || '').includes('Бібліотека')),
      paletteSwitchCanvasUi: Boolean(
        document.querySelector('[data-testid="palette-item-INPUT_SWITCH"] [data-testid="preview-symbol-INPUT_SWITCH"] [data-testid^="switch-toggle-"]'),
      ),
    }))()`);
    assert.equal(editorUiAudit.resetText, 'Скинути');
    assert.equal(editorUiAudit.customIcText, 'Створити ІМС');
    assert.equal(editorUiAudit.analyzerTitle.includes('ЛОГІЧНИЙ АНАЛІЗАТОР'), true);
    assert.equal(editorUiAudit.analyzerTitle.includes('ВІКНО СИГНАЛІВ'), false);
    assert.equal(editorUiAudit.hasOldPaletteWord, false);
    assert.equal(editorUiAudit.hasLibraryToggle, true);
    assert.equal(
      editorUiAudit.paletteSwitchCanvasUi,
      true,
      'Editor library cards must render exact canvas CircuitNode symbols',
    );

    const beforeMaxState = await cdp.eval(`(() => {
      const ws = document.querySelector('section[aria-label="Робоче полотно схеми"]');
      return {
        topZoomBtns: ws ? ws.querySelectorAll('.win95-titlebar button[aria-label*="масштаб"]').length : -1,
        statusZoomLabel: Boolean(ws?.querySelector('[data-testid="canvas-zoom-label"]')),
        workspaceWidth: ws ? ws.getBoundingClientRect().width : 0,
        asideCount: document.querySelectorAll('aside').length,
        hasLeftPalette: Boolean(document.querySelector('[data-testid="palette-item-INPUT_SWITCH"]')),
        hasRightInspector: Boolean(document.querySelector('[data-testid="resizer-right"] + aside')),
        hasSignals: Boolean(document.querySelector('[data-testid="signals-window"]')),
        hasSignalResizer: Boolean(document.querySelector('[data-testid="resizer-signals"]')),
      };
    })()`);
    assert.equal(beforeMaxState.topZoomBtns, 0, 'Duplicate zoom controls in top titlebar must be removed');
    assert.equal(beforeMaxState.statusZoomLabel, true, 'Zoom statusbar control must remain at bottom');
    assert.equal(beforeMaxState.asideCount, 2);
    assert.equal(beforeMaxState.hasLeftPalette, true);
    assert.equal(beforeMaxState.hasRightInspector, true);
    assert.equal(beforeMaxState.hasSignals, true);

    await cdp.eval(`document.querySelector('[data-testid="btn-toggle-maximize-workspace"]')?.click()`);
    await sleep(120);
    const maximizedState = await cdp.eval(`(() => {
      const ws = document.querySelector('section[aria-label="Робоче полотно схеми"]');
      return {
        workspaceWidth: ws ? ws.getBoundingClientRect().width : 0,
        asideCount: document.querySelectorAll('aside').length,
        hasLeftPalette: Boolean(document.querySelector('[data-testid="palette-item-INPUT_SWITCH"]')),
        hasRightInspector: Boolean(document.querySelector('[data-testid="resizer-right"] + aside')),
        hasSignals: Boolean(document.querySelector('[data-testid="signals-window"]')),
        hasLeftResizer: Boolean(document.querySelector('[data-testid="resizer-left"]')),
        hasRightResizer: Boolean(document.querySelector('[data-testid="resizer-right"]')),
        hasSignalResizer: Boolean(document.querySelector('[data-testid="resizer-signals"]')),
      };
    })()`);
    assert.ok(
      maximizedState.workspaceWidth > beforeMaxState.workspaceWidth + 300,
      'Maximizing workspace must expand width across full editor body',
    );
    assert.equal(maximizedState.asideCount, 0);
    assert.equal(maximizedState.hasLeftPalette, false);
    assert.equal(maximizedState.hasRightInspector, false);
    assert.equal(maximizedState.hasSignals, false);
    assert.equal(maximizedState.hasLeftResizer, false);
    assert.equal(maximizedState.hasRightResizer, false);
    assert.equal(maximizedState.hasSignalResizer, false);

    await cdp.eval(`document.querySelector('[data-testid="btn-toggle-maximize-workspace"]')?.click()`);
    await sleep(120);
    const restoredState = await cdp.eval(`({
      asideCount: document.querySelectorAll('aside').length,
      hasLeftPalette: Boolean(document.querySelector('[data-testid="palette-item-INPUT_SWITCH"]')),
      hasRightInspector: Boolean(document.querySelector('[data-testid="resizer-right"] + aside')),
      hasSignals: Boolean(document.querySelector('[data-testid="signals-window"]')),
    })`);
    assert.equal(restoredState.asideCount, 2);
    assert.equal(restoredState.hasLeftPalette, true);
    assert.equal(restoredState.hasRightInspector, true);
    assert.equal(restoredState.hasSignals, true);

    await cdp.navigate('/editor/preset-full-adder');
    await cdp.eval(`document.querySelector('[data-testid="btn-truth-table"]')?.click()`);
    await sleep(200);
    const dnfLatexAudit = await cdp.eval(`(() => {
      const dlg = document.querySelector('[role="dialog"]');
      const formulas = dlg ? Array.from(dlg.querySelectorAll('[data-testid="boolean-latex-formula"]')) : [];
      return {
        open: Boolean(dlg),
        formulaCount: formulas.length,
        hasOverlineSpan: Boolean(dlg?.querySelector('[data-testid="boolean-latex-formula"] span[class*="border-t-"]')),
        hasRawBang: Boolean(formulas.some((f) => (f.textContent || '').includes('!'))),
        hasRawCaret: Boolean(dlg?.textContent?.includes('2^n')),
      };
    })()`);
    await cdp.pressKey('Escape');
    assert.equal(dnfLatexAudit.open, true);
    assert.ok(dnfLatexAudit.formulaCount >= 1, 'DNF modal must render BooleanSopFormula');
    assert.equal(
      dnfLatexAudit.hasOverlineSpan,
      true,
      'DNF formula must render LaTeX overbar spans',
    );
    assert.equal(dnfLatexAudit.hasRawBang, false, 'DNF formula must NOT show raw ! negations');
    assert.equal(
      dnfLatexAudit.hasRawCaret,
      false,
      'DNF modal subtitle must render 2^n as superscript',
    );

    // [7/8] Reports Win95 Gray Table Headers, Schematic Print Graphic, Fonts & 0px Borders
    await cdp.setViewport(1440, 900, false);
    await cdp.navigate('/reports/preset-full-adder');
    const styleAudit = await cdp.eval(`(() => {
      const headers = Array.from(document.querySelectorAll('table thead th'));
      const lastTh = headers[headers.length - 1];
      const thStyle = lastTh ? getComputedStyle(lastTh) : null;
      const bodyFont = getComputedStyle(document.body).fontFamily;
      const reportSvg = document.querySelector('[data-testid="report-schematic-section"] [data-testid="circuit-canvas"]');
      const reportSection = document.querySelector('[data-testid="report-schematic-section"]');
      return {
        hasBom: document.body.innerText.includes('Експорт BOM (.csv)'),
        hasSchematicGraphic: Boolean(reportSvg),
        schematicViewBox: reportSvg?.getAttribute('viewBox') || '',
        dotGridCountInReport: reportSvg ? reportSvg.querySelectorAll('pattern').length : -1,
        statusbarCountInReport: reportSection ? reportSection.querySelectorAll('[data-testid="canvas-statusbar"]').length : -1,
        lastThBg: thStyle ? thStyle.backgroundColor : '',
        lastThColor: thStyle ? thStyle.color : '',
        bodyFont,
      };
    })()`);
    assert.ok(styleAudit.hasBom);
    assert.equal(
      styleAudit.hasSchematicGraphic,
      true,
      'ReportsPage must include vector circuit schematic graphic for viewing and printing',
    );
    assert.ok(
      styleAudit.schematicViewBox.split(' ').length === 4,
      'Report schematic must fit viewBox automatically without clipping',
    );
    assert.equal(
      styleAudit.dotGridCountInReport,
      0,
      'Report schematic must NOT include editor dot-grid background',
    );
    assert.equal(
      styleAudit.statusbarCountInReport,
      0,
      'Report schematic must hide editor statusbar',
    );
    assert.equal(
      styleAudit.lastThBg,
      'rgb(192, 192, 192)',
      'Truth table output header must be Win95 gray (#c0c0c0)',
    );
    assert.equal(
      styleAudit.lastThColor,
      'rgb(0, 0, 0)',
      'Truth table output header text must be black',
    );
    assert.ok(styleAudit.bodyFont.includes('Tahoma'));

    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    const authPrintAudit = await cdp.eval(`(() => {
      const tb = document.querySelector('[data-testid="print-title-block"]');
      const sheet = document.querySelector('.print-cad-sheet');
      const ft = document.querySelector('[data-testid="print-sheet-footer"]');
      return {
        tbDisplay: tb ? getComputedStyle(tb).display : '',
        tbText: tb?.innerText || '',
        tbOverflowX: tb ? tb.scrollWidth > tb.clientWidth + 1 : true,
        sheetBorderWidth: sheet ? getComputedStyle(sheet).borderTopWidth : '',
        ftDisplay: ft ? getComputedStyle(ft).display : '',
      };
    })()`);
    await cdp.send('Emulation.setEmulatedMedia', { media: '' });
    assert.notEqual(
      authPrintAudit.tbDisplay,
      'none',
      'CAD ЄСКД title block must show in print mode',
    );
    assert.equal(
      authPrintAudit.tbOverflowX,
      false,
      'PDF header title block must not horizontally clip or overflow',
    );
    assert.ok(authPrintAudit.tbText.includes('Розробив'), 'CAD title block must list author role');
    assert.ok(
      authPrintAudit.tbText.includes('Student') ||
        authPrintAudit.tbText.includes('Інженер-схемотехнік'),
      `CAD title block must contain logged-in author, got: ${authPrintAudit.tbText}`,
    );
    assert.ok(
      authPrintAudit.tbText.includes('Формат А4'),
      'CAD title block must show sheet format',
    );
    assert.equal(authPrintAudit.sheetBorderWidth, '2px', 'CAD sheet frame must have 2px border');
    assert.notEqual(
      authPrintAudit.ftDisplay,
      'none',
      'CAD bottom signature strip must show in print',
    );

    await cdp.navigate('/cabinet');
    const fieldAudit = await cdp.eval(`(() => {
      const inp = document.querySelector('input.win95-field');
      const dropdown = document.querySelector('button.win95-field[aria-haspopup="listbox"]');
      const nativeSelectCount = document.querySelectorAll('select').length;
      return {
        inputRadius: inp ? getComputedStyle(inp).borderRadius : '',
        dropdownRadius: dropdown ? getComputedStyle(dropdown).borderRadius : '',
        nativeSelectCount,
      };
    })()`);
    assert.equal(fieldAudit.inputRadius, '0px', 'Win95 inputs must have 0px border-radius');
    assert.equal(
      fieldAudit.dropdownRadius,
      '0px',
      'Win95 dropdown triggers must have 0px border-radius',
    );
    assert.equal(fieldAudit.nativeSelectCount, 0, 'Native <select> controls must be replaced');
    console.log(
      'PASS [7/8] Reports Win95 table headers, Tahoma/Courier fonts & 0px fields verified',
    );

    // [8/8] Mobile responsive (320x568) horizontal overflow check
    await cdp.setViewport(320, 568, true);
    for (const mobileRoute of ['/', '/editor/preset-ne555-jk', '/library', '/cabinet']) {
      await cdp.navigate(mobileRoute);
      const mobileAudit = await cdp.eval(`document.documentElement.scrollWidth`);
      assert.ok(
        mobileAudit <= 320,
        `Horizontal overflow on 320px for ${mobileRoute}: ${mobileAudit}`,
      );
    }
    assert.equal(
      cdp.uncaughtErrors.length,
      0,
      `Uncaught browser errors: ${cdp.uncaughtErrors.join(' | ')}`,
    );
    console.log('PASS [8/8] Mobile 320px responsive layout & zero JS runtime errors verified');
  } finally {
    cdp?.close();
    try {
      process.kill(-viteProc.pid, 'SIGTERM');
    } catch {
      viteProc.kill('SIGKILL');
    }
    try {
      process.kill(-chromeProc.pid, 'SIGTERM');
    } catch {
      chromeProc.kill('SIGKILL');
    }
    await sleep(120);
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  }
}

run().catch((err) => {
  console.error('E2E verification failed:', err);
  process.exit(1);
});
