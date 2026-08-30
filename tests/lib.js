// Shared helpers for the test suites.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

// Finds a Chromium to drive: $CHROMIUM, a Playwright download, or system Chrome.
function chromiumPath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(cache)) {
    const builds = fs.readdirSync(cache)
      .filter(d => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const b of builds) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const p = path.join(cache, b, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium found. Set $CHROMIUM to a Chrome/Chromium binary.');
}

// A popup opened as an ordinary tab never gets the activeTab grant that a real
// toolbar click provides, so the harness runs a copy with broad host permissions.
// Everything else is the shipping extension, byte for byte.
function buildTestExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vts-ext-'));
  for (const f of ['popup.html', 'popup.css', 'popup.js', 'manifest.json']) {
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.cpSync(path.join(ROOT, 'icons'), path.join(dir, 'icons'), { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.host_permissions = ['<all_urls>'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  return dir;
}

// Chrome derives an unpacked extension's id from the SHA-256 of its absolute path.
function extensionId(dir) {
  const h = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32);
  return [...h].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

// Pulls named functions out of popup.js so the tests can't drift from the source.
function popupSource(fromMarker, toMarker) {
  const src = fs.readFileSync(path.join(ROOT, 'popup.js'), 'utf8');
  return src.slice(src.indexOf(fromMarker), src.indexOf(toMarker));
}

function reporter() {
  const state = { fails: 0 };
  return {
    check(name, cond, extra = '') {
      if (!cond) state.fails++;
      console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
    },
    done(label) {
      console.log(state.fails ? `\n${state.fails} FAILURES in ${label}` : `\nall ${label} tests pass`);
      process.exit(state.fails ? 1 : 0);
    },
  };
}

module.exports = { ROOT, chromiumPath, buildTestExtension, extensionId, popupSource, reporter, PORT: 8731 };
