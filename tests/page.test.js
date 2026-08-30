// Verifies the functions that get injected into the page, against real <video> elements.
// Exercises the functions popup.js injects into pages, against real <video> elements.
const { chromium } = require('playwright-core');
const { chromiumPath, popupSource, reporter, PORT } = require('./lib');
const { check, done } = reporter();

const injected = popupSource('function pageRead', '/* ---------- time parsing');

(async () => {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/page.html`);
  await page.addScriptTag({ content: injected });
  await page.waitForFunction(() => {
    const v = document.getElementById('big');
    return v.readyState >= 1 && isFinite(v.duration);
  });

  // --- single video (only #big has metadata loaded and is largest) ---
  let s = await page.evaluate(() => pageRead());
  check('pageRead finds a video', !!s);
  check('duration ~30s', Math.abs(s.duration - 30) < 0.5, `got ${s.duration.toFixed(2)}`);
  check('title reported', s.title === 'Test Video Page', `got "${s.title}"`);

  // --- absolute seek ---
  s = await page.evaluate(() => pageSeek('abs', 12.5));
  const big = () => page.evaluate(() => document.getElementById('big').currentTime);
  check('abs seek moves the element', Math.abs(await big() - 12.5) < 0.6, `element at ${(await big()).toFixed(2)}`);
  check('abs seek return value', Math.abs(s.currentTime - 12.5) < 0.01);

  // --- relative seek ---
  await page.evaluate(() => pageSeek('rel', 5));
  check('rel +5 -> 17.5', Math.abs(await big() - 17.5) < 0.6, `element at ${(await big()).toFixed(2)}`);
  await page.evaluate(() => pageSeek('rel', -10));
  check('rel -10 -> 7.5', Math.abs(await big() - 7.5) < 0.6, `element at ${(await big()).toFixed(2)}`);

  // --- percent seek ---
  await page.evaluate(() => pageSeek('pct', 0.5));
  check('50% -> ~15s', Math.abs(await big() - 15) < 0.6, `element at ${(await big()).toFixed(2)}`);

  // --- clamping ---
  s = await page.evaluate(() => pageSeek('abs', 99999));
  check('clamps past the end', s.currentTime <= s.duration, `got ${s.currentTime.toFixed(2)} of ${s.duration.toFixed(2)}`);
  s = await page.evaluate(() => pageSeek('rel', -99999));
  check('clamps before zero', s.currentTime === 0, `got ${s.currentTime}`);

  // --- a playing video wins over a bigger paused one ---
  await page.evaluate(async () => {
    const sm = document.getElementById('small');
    await sm.play();
    sm.currentTime = 3;
  });
  await page.waitForFunction(() => !document.getElementById('small').paused);
  await page.evaluate(() => pageSeek('abs', 20));
  const [bigT, smallT] = await page.evaluate(() => [
    document.getElementById('big').currentTime,
    document.getElementById('small').currentTime,
  ]);
  check('playing video is preferred over larger paused one',
    Math.abs(smallT - 20) < 1.5 && bigT < 1, `small=${smallT.toFixed(2)} big=${bigT.toFixed(2)}`);

  // --- page with no video ---
  const blank = await browser.newPage();
  await blank.goto('data:text/html,<h1>nothing here</h1>');
  await blank.addScriptTag({ content: injected });
  check('returns null when there is no video', (await blank.evaluate(() => pageRead())) === null);

  await browser.close();
  done('page-logic');
})();
