// 尝试只读打开正在使用的 Chrome Cookies（Default 配置），检视 muse.ai 的加密前缀
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const p = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies');
console.log('目标:', p);

try {
  const db = new DatabaseSync(p, { readOnly: true });
  try {
    const rows = db.prepare(
      "SELECT host_key, name, length(encrypted_value) AS len, encrypted_value FROM cookies WHERE host_key LIKE '%muse.ai%'"
    ).all();

    console.log(`muse.ai cookie 条数: ${rows.length}\n`);
    for (const r of rows) {
      const b = Buffer.from(r.encrypted_value || []);
      console.log(`  ${r.host_key.padEnd(16)} ${r.name.padEnd(26)} len=${String(r.len).padEnd(5)} 前缀="${b.subarray(0, 3).toString('latin1')}"`);
    }

    const all = db.prepare('SELECT encrypted_value FROM cookies').all();
    let v10 = 0, v20 = 0, other = 0;
    for (const a of all) {
      const pre = Buffer.from(a.encrypted_value || []).subarray(0, 3).toString('latin1');
      if (pre === 'v10') v10++; else if (pre === 'v20') v20++; else other++;
    }
    console.log(`\n全库统计: v10=${v10}  v20=${v20}  其他=${other}  总计=${all.length}`);
  } finally {
    db.close();
  }
} catch (e) {
  console.log('打开失败:', e.message);
  console.log('\n→ 说明 Chrome 对该文件持有独占锁，需要换方式读取（VSS / 重启 Chrome / 扩展）');
}
