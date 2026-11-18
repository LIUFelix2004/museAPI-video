// 探测 Chrome Cookies 数据库：muse.ai 的 cookie 用什么前缀加密
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const TMP = path.join(process.env.TEMP || '.', 'ck_probe');
const files = fs.readdirSync(TMP).filter((f) => f.startsWith('Cookies_'));

for (const f of files) {
  const dbPath = path.join(TMP, f);
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (e) {
    console.log(`${f}: 打开失败 ${e.message}`);
    continue;
  }
  try {
    const rows = db.prepare(
      "SELECT host_key, name, length(encrypted_value) AS len, encrypted_value FROM cookies WHERE host_key LIKE '%muse.ai%'"
    ).all();

    console.log(`\n=== ${f} （muse.ai 相关 ${rows.length} 条）===`);
    for (const r of rows) {
      const buf = Buffer.from(r.encrypted_value || []);
      const prefix = buf.subarray(0, 3).toString('latin1');
      const hex = buf.subarray(0, 3).toString('hex');
      console.log(`  ${r.host_key.padEnd(14)} ${r.name.padEnd(26)} len=${String(r.len).padEnd(5)} 前缀="${prefix}" (hex ${hex})`);
    }

    // 统计整个库里 v10 / v20 的比例
    const all = db.prepare('SELECT length(encrypted_value) AS len, encrypted_value FROM cookies').all();
    let v10 = 0, v20 = 0, other = 0;
    for (const a of all) {
      const p = Buffer.from(a.encrypted_value || []).subarray(0, 3).toString('latin1');
      if (p === 'v10') v10++;
      else if (p === 'v20') v20++;
      else other++;
    }
    console.log(`  —— 全库统计: v10=${v10}  v20=${v20}  其他=${other}  总计=${all.length}`);
  } catch (e) {
    console.log(`${f}: 查询失败 ${e.message}`);
  } finally {
    db.close();
  }
}
