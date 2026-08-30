/* ---------- injected into the page (must be self-contained) ---------- */

function pageRead() {
  const pick = () => {
    const vids = [...document.querySelectorAll('video')].filter(
      v => isFinite(v.duration) && v.duration > 0
    );
    if (!vids.length) return null;
    const score = v => {
      const r = v.getBoundingClientRect();
      return (v.paused ? 0 : 1e9) + r.width * r.height;
    };
    return vids.sort((a, b) => score(b) - score(a))[0];
  };
  const v = pick();
  if (!v) return null;
  return {
    currentTime: v.currentTime,
    duration: v.duration,
    paused: v.paused,
    title: document.title,
  };
}

function pageSeek(mode, value) {
  const pick = () => {
    const vids = [...document.querySelectorAll('video')].filter(
      v => isFinite(v.duration) && v.duration > 0
    );
    if (!vids.length) return null;
    const score = v => {
      const r = v.getBoundingClientRect();
      return (v.paused ? 0 : 1e9) + r.width * r.height;
    };
    return vids.sort((a, b) => score(b) - score(a))[0];
  };
  const v = pick();
  if (!v) return null;

  let t =
    mode === 'rel' ? v.currentTime + value :
    mode === 'pct' ? v.duration * value :
    value;

  t = Math.max(0, Math.min(t, v.duration - 0.01));
  v.currentTime = t;
  return { currentTime: t, duration: v.duration, paused: v.paused, title: document.title };
}

function pageSaveResume(target) {
  const pick = () => {
    const vids = [...document.querySelectorAll('video')].filter(
      v => isFinite(v.duration) && v.duration > 0
    );
    if (!vids.length) return null;
    const score = v => {
      const r = v.getBoundingClientRect();
      return (v.paused ? 0 : 1e9) + r.width * r.height;
    };
    return vids.sort((a, b) => score(b) - score(a))[0];
  };
  const v = pick();
  if (!v) return null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const report = (saved, reason) => ({
    currentTime: v.currentTime, duration: v.duration, paused: v.paused,
    title: document.title, saved, reason,
  });

  return (async () => {
    if (target !== null) {
      v.currentTime = Math.max(0, Math.min(target, v.duration - 0.01));
    }

    // A player only reports its position while it is playing, and again when it
    // pauses. Already playing: the seek alone gets reported, so leave it be.
    if (!v.paused) {
      await sleep(1500);
      return report(true, '');
    }

    // Paused: play briefly, then pause — the pause is what flushes the report.
    const wasMuted = v.muted;
    const start = v.currentTime;
    v.muted = true;
    v.play().catch(() => {});  // a seek can cancel play(); progress is the real test

    let advanced = false;
    for (let i = 0; i < 24 && !advanced; i++) {
      await sleep(250);
      advanced = v.currentTime > start + 0.4;
    }
    if (advanced) await sleep(2500);  // let a little watch time accrue
    v.pause();
    v.muted = wasMuted;

    return report(advanced, advanced ? '' : 'playback would not start');
  })();
}

/* ---------- time parsing / formatting ---------- */

// Returns { mode: 'abs'|'rel'|'pct', value: number } or null.
function parseTime(raw) {
  let s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;

  // A leading + or - means "relative to where we are now".
  let mode = 'abs';
  let neg = false;
  if (s[0] === '+' || s[0] === '-') {
    mode = 'rel';
    neg = s[0] === '-';
    s = s.slice(1);
  }

  let value;
  if (s.endsWith('%')) {
    const p = parseFloat(s.slice(0, -1));
    if (!isFinite(p)) return null;
    const frac = (neg ? -p : p) / 100;
    return { mode: mode === 'rel' ? 'rel-pct' : 'pct', value: frac };
  } else if (/^[\d.]+(h|m|s)/.test(s) || /(h|m|s)$/.test(s)) {
    // 1h2m3s / 90s / 2m30 / 1h
    const m = s.match(/^(?:([\d.]+)h)?(?:([\d.]+)m)?(?:([\d.]+)s?)?$/);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    value = (parseFloat(m[1]) || 0) * 3600 + (parseFloat(m[2]) || 0) * 60 + (parseFloat(m[3]) || 0);
  } else if (s.includes(':')) {
    // ss / mm:ss / hh:mm:ss
    const parts = s.split(':');
    if (parts.length > 3 || parts.some(p => p === '' || !/^[\d.]+$/.test(p))) return null;
    value = parts.reduce((acc, p) => acc * 60 + parseFloat(p), 0);
  } else {
    value = parseFloat(s);
  }

  if (!isFinite(value)) return null;
  return { mode, value: neg ? -value : value };
}

// Builds a timestamped link: ?t= on YouTube, #t= everywhere else.
function timestampedUrl(rawUrl, seconds) {
  const t = Math.floor(seconds);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    url.searchParams.set('t', String(t));
    url.hash = '';
  } else {
    url.hash = '#t=' + t;
  }
  return url.toString();
}

function fmt(t) {
  if (!isFinite(t)) return '–:–';
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ---------- popup wiring ---------- */

const $ = id => document.getElementById(id);
const els = {
  title: $('title'), cur: $('cur'), dur: $('dur'), fill: $('fill'),
  form: $('form'), time: $('time'), go: $('go'), copy: $('copy'), save: $('save'),
  status: $('status'),
};

let tab = null;
let state = null;
let prefilled = false;
let busy = false;  // set while a save is in flight, so polling cannot re-enable the UI

function setStatus(msg, kind = '') {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
}

function setEnabled(on) {
  if (busy) on = false;
  els.go.disabled = !on;
  els.time.disabled = !on;
  els.copy.disabled = !on;
  els.save.disabled = !on;
  document.querySelectorAll('.nudge, .pct').forEach(b => (b.disabled = !on));
}

function render() {
  if (!state) {
    els.title.textContent = 'No video found on this page';
    els.cur.textContent = '–:–';
    els.dur.textContent = '–:–';
    els.fill.style.width = '0%';
    setEnabled(false);
    return;
  }
  setEnabled(true);
  els.title.textContent = state.title || '';
  els.cur.textContent = fmt(state.currentTime);
  els.dur.textContent = fmt(state.duration);
  els.fill.style.width = (100 * state.currentTime / state.duration).toFixed(2) + '%';
  if (!prefilled) {
    prefilled = true;
    els.time.value = fmt(state.currentTime);
    els.time.focus();
    els.time.select();
  }
}

// Runs `func` in every frame of the tab; returns the first frame result that
// actually found a video (embedded players live in iframes).
async function inPage(func, args = [], quiet = false) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func,
      args,
    });
    return results.map(r => r.result).find(r => r) || null;
  } catch (e) {
    // The polling path stays quiet: a page navigating out from under us throws
    // here for a moment, and that is not worth shouting about.
    if (!quiet) {
      setStatus(e.message.includes('Cannot access')
        ? 'Chrome blocks extensions on this page.'
        : e.message, 'err');
    }
    return null;
  }
}

async function refresh() {
  state = await inPage(pageRead);
  render();
}

async function seek(mode, value) {
  const next = await inPage(pageSeek, [mode, value]);
  if (next) {
    state = next;
    render();
    setStatus('Set to ' + fmt(next.currentTime), 'ok');
  } else if (els.status.className === 'status') {
    setStatus('No video found.', 'err');
  }
}

els.form.addEventListener('submit', e => {
  e.preventDefault();
  const p = parseTime(els.time.value);
  if (!p) return setStatus('Try 90, 1:30, 1:02:03, 1h2m3s, +30 or 50%.', 'err');
  if (p.mode === 'rel-pct') return seek('rel', p.value * (state?.duration || 0));
  seek(p.mode, p.value);
});

document.querySelectorAll('.nudge').forEach(b =>
  b.addEventListener('click', () => seek('rel', Number(b.dataset.d)))
);
document.querySelectorAll('.pct').forEach(b =>
  b.addEventListener('click', () => seek('pct', Number(b.dataset.p)))
);

els.save.addEventListener('click', async () => {
  // Use whatever is typed, if it parses; otherwise save where the video already is.
  const p = parseTime(els.time.value);
  let target = null;
  if (p) {
    if (p.mode === 'rel') target = (state?.currentTime || 0) + p.value;
    else if (p.mode === 'pct') target = (state?.duration || 0) * p.value;
    else if (p.mode === 'rel-pct') target = (state?.currentTime || 0) + (state?.duration || 0) * p.value;
    else target = p.value;
  }

  busy = true;
  setEnabled(false);
  setStatus('Saving…');
  const res = await inPage(pageSaveResume, [target]);
  busy = false;
  setEnabled(true);

  if (!res) return setStatus('No video found.', 'err');
  state = res;
  render();
  setStatus(
    res.saved ? 'Resume point saved at ' + fmt(res.currentTime)
              : 'Could not save — ' + res.reason + '. Press play once, then retry.',
    res.saved ? 'ok' : 'err'
  );
});

els.copy.addEventListener('click', async () => {
  if (!state || !tab?.url) return;
  const t = Math.floor(state.currentTime);
  const link = timestampedUrl(tab.url, t);
  if (!link) return setStatus('Cannot build a link for this page.', 'err');
  try {
    await navigator.clipboard.writeText(link);
    setStatus('Copied link at ' + fmt(t), 'ok');
  } catch {
    setStatus('Clipboard blocked by the browser.', 'err');
  }
});

(async () => {
  setEnabled(false);
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return setStatus('No active tab.', 'err');
  await refresh();
  // Keep the readout live while the popup is open. A null result means the video
  // went away (navigation, closed player) — reflect that instead of showing stale time.
  setInterval(async () => {
    state = await inPage(pageRead, [], true);
    render();
  }, 400);
})();
