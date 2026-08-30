// Static server with real Range support — without it Chrome treats the mp4 as
// non-seekable and silently snaps currentTime back to 0.
const http = require('http'), fs = require('fs'), path = require('path');
const dir = require('path').join(__dirname, 'fixtures');
const types = { '.html': 'text/html', '.mp4': 'video/mp4' };

const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('nope');
    return;
  }
  const size = fs.statSync(f).size;
  const type = types[path.extname(f)] || 'text/plain';
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);

  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? parseInt(range[2], 10) : size - 1;
    if (start >= size || end >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(f, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(f).pipe(res);
  }
});

function start(port = 8731) {
  return new Promise(resolve => server.listen(port, () => resolve(server)));
}

module.exports = { start };
if (require.main === module) start().then(() => console.log('serving fixtures on 8731'));
