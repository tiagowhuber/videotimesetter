// Loads the real unpacked extension in Chromium and drives its popup against a real video tab.
// Loads the extension in Chromium and drives its popup against a real video tab.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { chromiumPath, buildTestExtension, extensionId, reporter, PORT } = require('./lib');
const { check, done } = reporter();

const EXT = buildTestExtension();

(async () => {
  const userDir = fs.mkdtempSync('/tmp/vts-profile-');
  const ctx = await chromium.launchPersistentContext(userDir, {
    executablePath: chromiumPath(),
    headless: false,
    viewport: { width: 900, height: 700 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const id = extensionId(EXT);
  console.log('extension id:', id);

  // Tab 1: the video page. Must be the ACTIVE tab, since the popup targets the active tab.
  const videoTab = ctx.pages()[0] || await ctx.newPage();
  await videoTab.goto(`http://localhost:${PORT}/page.html`);
  await videoTab.waitForFunction(() => {
    const v = document.getElementById('big');
    return v.readyState >= 1 && isFinite(v.duration);
  });

  // Tab 2: the extension popup, opened as a normal tab so we can script it.
  const popup = await ctx.newPage();
  const resp = await popup.goto(`chrome-extension://${id}/popup.html`);
  check('popup.html loads from the extension', !!resp && resp.status() === 200,
    resp ? `status ${resp.status()}` : 'no response');

  const errors = [];
  popup.on('pageerror', e => errors.push(e.message));
  popup.on('console', m => m.type() === 'error' && errors.push(m.text()));

  // Make the video tab the active one, then reload the popup so its init sees it.
  // (A real popup is opened by a toolbar click, so the video tab is always active.)
  await videoTab.bringToFront();
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('dur').textContent !== '–:–',
    null, { timeout: 5000 }).catch(() => {});

  const read = () => popup.evaluate(() => ({
    title: document.getElementById('title').textContent,
    cur: document.getElementById('cur').textContent,
    dur: document.getElementById('dur').textContent,
    input: document.getElementById('time').value,
    status: document.getElementById('status').textContent,
    goDisabled: document.getElementById('go').disabled,
  }));
  const elementTime = () => videoTab.evaluate(() => document.getElementById('big').currentTime);

  let ui = await read();
  check('popup reads the active tab\'s video', ui.dur === '0:30',
    `duration "${ui.dur}" status "${ui.status}"`);
  check('popup shows the page title', ui.title === 'Test Video Page', `got "${ui.title}"`);
  check('controls enabled when a video is found', ui.goDisabled === false);

  // Type a timestamp and submit it.
  await popup.fill('#time', '0:20');
  await popup.click('#go');
  await popup.waitForTimeout(400);
  check('typing 0:20 seeks the real video', Math.abs(await elementTime() - 20) < 0.6,
    `video at ${(await elementTime()).toFixed(2)}`);
  ui = await read();
  check('status confirms the seek', ui.status === 'Set to 0:20', `got "${ui.status}"`);
  check('readout follows the video', ui.cur === '0:20', `got "${ui.cur}"`);

  // hh:mm:ss beyond the end should clamp, not break.
  await popup.fill('#time', '1:02:03');
  await popup.click('#go');
  await popup.waitForTimeout(300);
  check('overlong timestamp clamps to the end', Math.abs(await elementTime() - 30) < 0.2,
    `video at ${(await elementTime()).toFixed(2)}`);

  // Relative input.
  await popup.fill('#time', '-12');
  await popup.click('#go');
  await popup.waitForTimeout(300);
  check('-12 rewinds 12s', Math.abs(await elementTime() - 18) < 0.6,
    `video at ${(await elementTime()).toFixed(2)}`);

  // Nudge buttons.
  await popup.click('.nudge[data-d="-10"]');
  await popup.waitForTimeout(300);
  check('−10 button nudges back', Math.abs(await elementTime() - 8) < 0.6,
    `video at ${(await elementTime()).toFixed(2)}`);
  await popup.click('.nudge[data-d="1"]');
  await popup.waitForTimeout(300);
  check('+1 button nudges forward', Math.abs(await elementTime() - 9) < 0.6,
    `video at ${(await elementTime()).toFixed(2)}`);

  // Percent buttons.
  await popup.click('.pct[data-p="0.75"]');
  await popup.waitForTimeout(300);
  check('75% button jumps to 22.5s', Math.abs(await elementTime() - 22.5) < 0.6,
    `video at ${(await elementTime()).toFixed(2)}`);

  // Bad input.
  await popup.fill('#time', 'banana');
  await popup.click('#go');
  ui = await read();
  check('bad input explains the formats', /Try 90, 1:30/.test(ui.status), `got "${ui.status}"`);

  // Copy link (clipboard is blocked in this harness, so capture the write instead).
  await popup.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: t => { window.__copied = t; return Promise.resolve(); } },
    });
  });
  await popup.click('#copy');
  await popup.waitForTimeout(200);
  const copied = await popup.evaluate(() => window.__copied);
  check('copy writes a timestamped link', /#t=22$/.test(copied || ''), `got "${copied}"`);

  // --- Save resume point ---
  // The button plays the video for a moment (that is what makes a site record a
  // position) and must hand the player back exactly as it found it.
  const bigState = () => videoTab.evaluate(() => {
    const v = document.getElementById('big');
    return { t: v.currentTime, paused: v.paused, muted: v.muted };
  });

  await videoTab.evaluate(() => {
    const v = document.getElementById('big');
    v.pause();
    v.muted = false;
    v.currentTime = 5;
  });
  await popup.fill('#time', '');
  await popup.click('#save');
  await popup.waitForFunction(() => !document.getElementById('save').disabled, null, { timeout: 20000 });
  let after = await bigState();
  ui = await read();
  check('save reports success', /Resume point saved at/.test(ui.status), `got "${ui.status}"`);
  check('save actually played the video', after.t > 5.4, `position ${after.t.toFixed(2)}`);
  check('save leaves the video paused again', after.paused === true);
  check('save restores the muted state', after.muted === false);

  // With a time typed in, it should seek there first, then save.
  await popup.fill('#time', '0:22');
  await popup.click('#save');
  await popup.waitForFunction(() => !document.getElementById('save').disabled, null, { timeout: 20000 });
  after = await bigState();
  check('save honours a typed timestamp', after.t > 22 && after.t < 27, `position ${after.t.toFixed(2)}`);
  check('save re-pauses after seeking', after.paused === true);

  // A video that was already playing must be left playing.
  await videoTab.evaluate(async () => {
    const v = document.getElementById('big');
    v.muted = true;
    v.currentTime = 3;
    await v.play();
  });
  await popup.fill('#time', '');
  await popup.click('#save');
  await popup.waitForFunction(() => !document.getElementById('save').disabled, null, { timeout: 20000 });
  after = await bigState();
  check('save leaves a playing video playing', after.paused === false, `paused=${after.paused}`);
  await videoTab.evaluate(() => document.getElementById('big').pause());

  // A page with no video should degrade gracefully.
  await videoTab.goto(`http://localhost:${PORT}/novideo.html`);
  await videoTab.bringToFront();
  await popup.waitForTimeout(900);
  ui = await read();
  check('no-video page disables controls', ui.goDisabled === true);
  check('no-video page says so', /No video found/.test(ui.title), `got "${ui.title}"`);

  check('no uncaught errors in the popup', errors.length === 0, errors.join(' | '));

  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.rmSync(EXT, { recursive: true, force: true });
  done('end-to-end');
})();
