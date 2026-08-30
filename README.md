# Video Time Setter

A tiny Chrome/Edge (Manifest V3) extension that jumps any HTML5 video to an exact
timestamp — YouTube, Vimeo, Twitch VODs, course players, plain `<video>` tags,
embedded iframes.

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → pick this folder
4. Pin the clock icon to the toolbar

Open it with the toolbar button or **Alt+Shift+T**.

## Accepted time formats

| Input     | Meaning                          |
|-----------|----------------------------------|
| `90`      | 90 seconds                       |
| `1:30`    | 1 min 30 s                       |
| `1:02:03` | 1 h 2 min 3 s                    |
| `1h2m3s`  | same, YouTube-style              |
| `2m30`    | 2 min 30 s                       |
| `+30`     | 30 s forward from current time   |
| `-1:30`   | 90 s back from current time      |
| `50%`     | halfway through                  |
| `+10%`    | 10% of total duration forward    |

Also: the `−60 … +60` buttons nudge, the `0% 25% 50% 75%` buttons jump, and
**Copy link** puts a timestamped URL on the clipboard (`?t=` on YouTube, `#t=`
elsewhere).

## Save resume point

Seeking moves the player; it does not, on its own, change what a site remembers
about where you stopped. **Save resume point** is for that.

The extension never talks to YouTube's API itself. A player reports your
position to `/api/stats/watchtime` with a `cmt` (current media time) parameter,
and it only does that while it is playing, plus once more when it pauses. So the
button works with the player rather than around it:

- video already playing — seek, then wait a moment; the seek itself is reported
- video paused — mute, play until the position actually advances, pause again
  (the pause is what flushes the report), then restore the muted state

If playback refuses to start, it says so instead of claiming a save.

Verified: calling this on a real YouTube video that was playing produced a
`watchtime` request carrying the new position (`cmt=300` after asking for 5:00).
Not verified: whether YouTube then moves the red progress bar on your thumbnails
backward — that depends on your account, and testing it means being logged in as
you. Treat that part as plausible-but-unconfirmed until you try it.

To clear a video's progress outright instead of correcting it, remove it from
watch history at `youtube.com/feed/history` — that drops the red bar entirely.

## How it works

No content scripts and no host permissions — it uses `activeTab` + `scripting`,
so page code runs only in the tab that's open when you click the button. It
scans every frame, and among videos with a real duration picks the one that's
playing, else the largest on screen.

## Files

- `manifest.json` — MV3 manifest, `activeTab` + `scripting`
- `popup.html` / `popup.css` — the UI
- `popup.js` — time parsing, and the `pageRead` / `pageSeek` functions injected into the page
- `icons/` — generated clock icons
- `tests/` — see below

## Tests

```
npm install     # playwright-core; it reuses an already-downloaded Chromium
npm test
```

Three suites:

- `tests/unit.test.js` — `parseTime`, `timestampedUrl`, `fmt`, run against the
  real source pulled out of `popup.js` so the tests cannot drift from it.
- `tests/page.test.js` — `pageRead` / `pageSeek` against real `<video>` elements:
  seeking, clamping at both ends, and preferring a playing video over a larger
  paused one.
- `tests/e2e.test.js` — loads the extension in Chromium and drives the actual
  popup against a real video tab: typing a timestamp, the nudge and percent
  buttons, bad input, copying a link, saving a resume point (including that it
  leaves the player paused/unmuted exactly as it found it), and a page with no
  video.

Two harness notes. The e2e suite runs a copy of the extension with
`host_permissions: ["<all_urls>"]`, because a popup opened as an ordinary tab
never receives the `activeTab` grant a real toolbar click provides; everything
else in that copy is the shipping code. And it needs a headed Chromium, since
extensions do not load headless — the runner puts that behind `xvfb-run` when
it is available.

## Limits

- Chrome blocks extensions on `chrome://` pages, the Web Store, and other
  extensions' pages — the popup says so instead of failing silently.
- DRM players that hide their `<video>` (Netflix-style) may not respond.
- **Save resume point** briefly plays the video, muted. On a site that counts
  views or reports watch time, that is real playback — it is doing the same
  thing you would by pressing play for three seconds.
- Live streams have no fixed duration, so `%` jumps don't apply to them.
