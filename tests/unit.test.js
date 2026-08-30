// Unit tests for the pure helpers in popup.js: parseTime, timestampedUrl, fmt.
const { popupSource, reporter } = require('./lib');
const { check, done } = reporter();

eval(popupSource('// Returns { mode:', '/* ---------- popup wiring'));

const cases = [
  ['90',        {mode:'abs', value:90}],
  ['90.5',      {mode:'abs', value:90.5}],
  ['1:30',      {mode:'abs', value:90}],
  ['1:02:03',   {mode:'abs', value:3723}],
  ['0:05',      {mode:'abs', value:5}],
  ['1h2m3s',    {mode:'abs', value:3723}],
  ['2m30s',     {mode:'abs', value:150}],
  ['2m30',      {mode:'abs', value:150}],
  ['90s',       {mode:'abs', value:90}],
  ['1h',        {mode:'abs', value:3600}],
  ['1H 2M 3S',  {mode:'abs', value:3723}],
  ['+30',       {mode:'rel', value:30}],
  ['-30',       {mode:'rel', value:-30}],
  ['-1:30',     {mode:'rel', value:-90}],
  ['+1m',       {mode:'rel', value:60}],
  ['50%',       {mode:'pct', value:0.5}],
  ['+10%',      {mode:'rel-pct', value:0.1}],
  ['-10%',      {mode:'rel-pct', value:-0.1}],
  ['',          null],
  ['abc',       null],
  ['1:2:3:4',   null],
  ['1::3',      null],
];

for (const [input, want] of cases) {
  check(`parseTime(${JSON.stringify(input)})`,
    JSON.stringify(parseTime(input)) === JSON.stringify(want),
    `-> ${JSON.stringify(parseTime(input))}`);
}
const urlCases = [
  ['https://www.youtube.com/watch?v=abc123', 95, 'https://www.youtube.com/watch?v=abc123&t=95'],
  ['https://www.youtube.com/watch?v=abc123&t=10', 95, 'https://www.youtube.com/watch?v=abc123&t=95'],
  ['https://youtu.be/abc123', 95, 'https://youtu.be/abc123?t=95'],
  ['https://m.youtube.com/watch?v=abc123', 5, 'https://m.youtube.com/watch?v=abc123&t=5'],
  ['https://www.youtube.com/watch?v=abc123#foo', 7, 'https://www.youtube.com/watch?v=abc123&t=7'],
  ['https://vimeo.com/12345', 95, 'https://vimeo.com/12345#t=95'],
  ['https://example.com/a?b=c', 12.9, 'https://example.com/a?b=c#t=12'],
  ['chrome://settings', 5, null],
  ['not a url', 5, null],
];
for (const [u, t, want] of urlCases) {
  check(`timestampedUrl(${u}, ${t})`, timestampedUrl(u, t) === want, `-> ${timestampedUrl(u, t)}`);
}

for (const [t, want] of [[0, '0:00'], [5, '0:05'], [65, '1:05'], [3723, '1:02:03'], [3600, '1:00:00'], [NaN, '\u2013:\u2013']]) {
  check(`fmt(${t})`, fmt(t) === want, `-> ${fmt(t)}`);
}

done('unit');
