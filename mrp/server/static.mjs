// 静态文件（规格 M.6.10：静态文件和接口由同一个进程提供）。只给仓库里的游戏文件：
// 拦住路径穿越；只给白名单里的路径，不给隐藏文件（.git 之类）、服务器代码、文档、package.json 和联机数据目录。
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
// 白名单：只给游戏页面用到的东西（首页、src/、assets/）；隐藏文件一律不给。
const ALLOW = /^(index\.html|src\/.+|assets\/.+)$/;
const HIDDEN = /(^|\/)\./;

export function serveStatic(root, req, res, { deny = [] } = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { rel = null; }
  if (rel === null || rel.includes('\0')) { res.writeHead(400).end('bad path'); return true; }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(root, `.${path.posix.normalize(rel)}`);
  const inside = file === root || file.startsWith(root + path.sep);
  const relPath = path.relative(root, file).split(path.sep).join('/');
  if (!inside || !ALLOW.test(relPath) || HIDDEN.test(relPath) || deny.some(d => file.startsWith(d))) { res.writeHead(404).end('not found'); return true; }
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404).end('not found'); return true; }
  if (!st.isFile()) { res.writeHead(404).end('not found'); return true; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}
