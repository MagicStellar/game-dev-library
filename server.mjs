import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./catalog.js', import.meta.url), 'utf8');
const catalog = JSON.parse(source.trim().slice('const catalog = '.length, -1));
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const searchIndex = catalog.map(video => ({
  video,
  text: normalize([video.title, video.topic, video.tags, video.channel, video.kind, video.game, video.studio, video.year].join(' '))
})).sort((a,b) => (a.video.rank ?? Infinity) - (b.video.rank ?? Infinity) || Number(a.video.other) - Number(b.video.other));
const ids = new Set(catalog.map(video => video.id));
const topics = new Map();
for (const {topic} of catalog) topics.set(topic, (topics.get(topic) ?? 0) + 1);
const metadata = {
  topics: [...topics].sort(([a],[b]) => a.localeCompare(b)),
  channels: [...new Set(catalog.map(video => video.channel))].sort()
};
const pageSize = 24;

function search(params) {
  const tokens = normalize((params.get('q') ?? '').trim()).split(/\s+/).filter(Boolean);
  const topic = params.get('topic');
  const channel = params.get('channel');
  const collection = params.get('collection');
  const matches = searchIndex.filter(({video, text}) =>
    (!topic || video.topic === topic) &&
    (!channel || video.channel === channel) &&
    (collection !== 'learning' || !video.other) &&
    (collection !== 'other' || video.other) &&
    (collection !== 'starter' || video.rank !== null) &&
    tokens.every(token => text.includes(token))
  );
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.max(1, Math.min(pages, Number.parseInt(params.get('page'), 10) || 1));
  const offset = (page - 1) * pageSize;
  return {page, pages, offset, total: matches.length, videos: matches.slice(offset, offset + pageSize).map(({video}) => video)};
}

const assets = new Map(await Promise.all([
  ['/', 'index.html', 'text/html'],
  ['/app.js', 'app.js', 'text/javascript'],
  ['/style.css', 'style.css', 'text/css'],
].map(async ([route, file, type]) => [route, {type: type + '; charset=utf-8', body: await readFile(new URL(file, import.meta.url))}])));

function send(res, status, type, body, cache = 'no-cache') {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control': cache});
  res.end(body);
}

async function thumbnail(id, res) {
  if (ids.has(id)) {
    try {
      const image = await fetch('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', {signal: AbortSignal.timeout(3500)});
      if (image.ok && image.headers.get('content-type')?.startsWith('image/')) {
        const body = Buffer.from(await image.arrayBuffer());
        return send(res, 200, 'image/jpeg', body, 'public, max-age=86400');
      }
      await image.body?.cancel();
    } catch {
      // The browser can still try YouTube's alternate CDN hostname.
    }
    res.writeHead(302, {Location: 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg', 'Cache-Control': 'no-store'});
    return res.end();
  }
  send(res, 404, 'text/plain', 'Video not found');
}

const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const {pathname, searchParams} = new URL(req.url, 'http://localhost');
    const asset = assets.get(pathname);
    if (asset) return send(res, 200, asset.type, asset.body);
    if (pathname === '/api/catalog' || pathname === '/api/videos') {
      const payload = pathname === '/api/catalog' ? metadata : search(searchParams);
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(payload));
    }
    if (pathname.startsWith('/thumbnail/')) return await thumbnail(pathname.slice('/thumbnail/'.length), res);
    send(res, 404, 'text/plain', 'Page not found');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, 'text/plain', 'Unable to load this request');
    else res.end();
  }
}).listen(port, '127.0.0.1', () => console.log('Game Dev Library is running at http://127.0.0.1:' + port));
