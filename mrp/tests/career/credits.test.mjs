// P3.U3 的鸣谢验收（规格 E10、F2）：旧版署名、名册每一项的授权、art-manifest 的每张图都能在 CREDITS 里找到。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CREDITS } from '../../src/career/data/credits.js';
import { CHARACTER_ROSTER } from '../../src/career/data/roster.js';
import { HW_CREDITS } from '../../src/career/data/hardware_gen.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../../docs/art-manifest.json', import.meta.url), 'utf8'));

const matchesFile = (entry, file) => !!entry.file && (entry.file.endsWith('-') ? file.startsWith(entry.file) : entry.file === file);

describe('鸣谢：来源和字段', () => {
  it('包含旧版署名的 ZipZipPipe、上善无形原设和 CC BY-NC-SA 4.0', () => {
    const all = JSON.stringify(CREDITS);
    assert.match(all, /ZipZipPipe/);
    assert.match(all, /上善无形/);
    assert.match(all, /CC BY-NC-SA 4\.0/);
  });

  it('每一条都有 who、what、license、url（没有链接时是 null）', () => {
    assert.ok(CREDITS.length > 0);
    for (const c of CREDITS) {
      assert.equal(typeof c.id, 'string', JSON.stringify(c));
      assert.ok(c.id, '空 id');
      assert.ok(c.who && String(c.who).trim(), `${c.id} 没有 who`);
      assert.ok(c.what && String(c.what).trim(), `${c.id} 没有 what`);
      assert.ok(c.license && String(c.license).trim(), `${c.id} 没有 license`);
      assert.ok('url' in c, `${c.id} 没有 url 字段`);
      assert.ok(c.url === null || /^https?:\/\//.test(c.url), `${c.id} 的 url 既不是 null 也不是网址：${c.url}`);
    }
  });

  it('名册每一项都有对应的授权条目，who 和 url 直接等于名册的 credit / source_url', () => {
    for (const r of CHARACTER_ROSTER) {
      const c = CREDITS.find(x => x.id === `char.${r.id}`);
      assert.ok(c, `名册角色 ${r.id} 没有鸣谢条目`);
      assert.equal(c.who, r.credit, `${r.id} 的作者和名册不一致`);
      assert.equal(c.url, r.source_url, `${r.id} 的来源和名册不一致`);
      assert.ok(c.license, `${r.id} 没有授权说法`);
    }
  });

  it('HW_CREDITS 每一项都在 CREDITS 里', () => {
    for (const [id, h] of Object.entries(HW_CREDITS)) {
      const c = CREDITS.find(x => x.id === `hw.${id}`);
      assert.ok(c, `硬件 ${id} 没有鸣谢条目`);
      assert.equal(c.who, h.author);
      assert.equal(c.license, h.license);
      assert.equal(c.url, h.source_url);
    }
  });

  it('art-manifest.json 里的每一张图都能在 CREDITS 里找到条目', () => {
    assert.ok(manifest.assets.length > 0);
    for (const a of manifest.assets) {
      const hit = CREDITS.some(c => matchesFile(c, a.file));
      assert.ok(hit, `${a.file} 在 CREDITS 里没有条目`);
    }
  });

  it('docs/ART_CREDITS.txt 里缺的 7 张 event-*.png 只补了条目，没有动图片文件', () => {
    const events = CREDITS.filter(c => c.kind === 'event-background');
    const files = events.map(c => c.file).sort();
    assert.deepEqual(files, [
      'assets/backgrounds/event-court.png',
      'assets/backgrounds/event-datacenter.png',
      'assets/backgrounds/event-exchange.png',
      'assets/backgrounds/event-hearing.png',
      'assets/backgrounds/event-lab-night.png',
      'assets/backgrounds/event-launch.png',
      'assets/backgrounds/event-port.png',
    ]);
    for (const c of events) {
      assert.ok(c.who && c.license, `${c.id} 缺作者或许可`);
      assert.equal(c.url, null);
    }
    // manifest 里确实没有这七张：补的是条目，不是清单里的记录。
    assert.ok(!manifest.assets.some(a => /event-/.test(a.file)), 'art-manifest.json 里不应该有 event 图记录');
  });
});
