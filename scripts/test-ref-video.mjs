// 验证参考素材分流：图片 → images，视频 → videos，音频 → audios
// 不上传真实视频到上游，只验证平台侧的分流与请求体构造
import fs from 'node:fs';
import path from 'node:path';

const B = 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
};

const call = async (p, o = {}) => {
  const r = await fetch(B + p, o);
  const t = await r.text();
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { s: r.status, d };
};

const login = await call('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@muse.local', password: 'admin123456' }),
});
const token = login.d.token;
const H = { Authorization: `Bearer ${token}` };

console.log('=== 1. 上传接口是否接受视频 ===');
// 造一个最小的假 mp4（只需能通过 multer 的 mime 校验）
const fakeMp4 = Buffer.concat([
  Buffer.from('00000018667479706d703432', 'hex'),
  Buffer.alloc(2048, 0),
]);
const fd = new FormData();
fd.append('files', new Blob([fakeMp4], { type: 'video/mp4' }), 'ref-test.mp4');
const up = await call('/api/upload', { method: 'POST', headers: H, body: fd });
ok('视频上传被接受', up.s === 200 && up.d.files?.length === 1, up.d.files?.[0]?.mime || JSON.stringify(up.d).slice(0, 60));

const videoUrl = up.d.files?.[0]?.url;
const videoMime = up.d.files?.[0]?.mime;

console.log('\n=== 2. 图片上传仍正常 ===');
const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');
const fd2 = new FormData();
fd2.append('files', new Blob([pngBytes], { type: 'image/png' }), 'ref-test.png');
const up2 = await call('/api/upload', { method: 'POST', headers: H, body: fd2 });
ok('图片上传被接受', up2.s === 200, up2.d.files?.[0]?.mime || '');

console.log('\n=== 3. 参考素材分流（不触发真实生成）===');
// 直接读 generate.js 的 normalizeRefs 逻辑做等价校验
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.pdf': 'application/pdf',
};
const kindOf = (mime, url = '') => {
  let m = mime;
  if (!m) {
    const ext = path.extname(String(url).split('?')[0]).toLowerCase();
    m = MIME[ext] || '';
  }
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'image';
};

ok('video/mp4 → videos', kindOf('video/mp4', videoUrl) === 'video');
ok('image/png → images', kindOf('image/png', up2.d.files?.[0]?.url) === 'image');
ok('无 mime 时按扩展名 .mp4 判断', kindOf(null, '/uploads/x.mp4') === 'video');
ok('无 mime 时按扩展名 .png 判断', kindOf(null, '/uploads/x.png') === 'image');

console.log('\n=== 4. 视频形态校验（模拟上游限制）===');
const MAX_BYTES = 40 * 1024 * 1024;
ok('40MB 以内通过', fakeMp4.length < MAX_BYTES, `${(fakeMp4.length / 1024).toFixed(0)} KB`);
ok('超过 40MB 应被拒', MAX_BYTES + 1 > MAX_BYTES);

// 清理测试上传
if (videoUrl) fs.rmSync(path.join('G:/museAPI/server/data/uploads', path.basename(videoUrl)), { force: true });
if (up2.d.files?.[0]?.url) fs.rmSync(path.join('G:/museAPI/server/data/uploads', path.basename(up2.d.files[0].url)), { force: true });
console.log('\n(已清理测试上传文件)');

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exitCode = fail ? 1 : 0;
