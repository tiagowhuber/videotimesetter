// Runs every suite: npm test
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PORT } = require('./lib');

const ROOT = path.join(__dirname, '..');
const hasXvfb = fs.existsSync('/usr/bin/xvfb-run');

function runSuite(file, headed) {
  // The e2e suite needs a headed Chromium (extensions do not load otherwise);
  // xvfb keeps that window off the user's screen when it is available.
  const [cmd, args] = hasXvfb && headed
    ? ['xvfb-run', ['-a', 'node', file]]
    : ['node', [file]];
  console.log(`\n=== ${file} ===`);
  return spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT }).status || 0;
}

// The fixture server runs in its own process: spawnSync below blocks this
// event loop, so an in-process server would never answer a request.
const server = spawn('node', [path.join(__dirname, 'serve.js')], { stdio: 'inherit' });
process.on('exit', () => server.kill());

setTimeout(() => {
  let failed = 0;
  failed += runSuite('tests/unit.test.js', false);
  failed += runSuite('tests/page.test.js', false);
  failed += runSuite('tests/e2e.test.js', true);
  server.kill();
  console.log(failed ? '\nSOME SUITES FAILED' : '\nall suites pass');
  process.exit(failed ? 1 : 0);
}, 500);
