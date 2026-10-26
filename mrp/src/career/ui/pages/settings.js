// 后台 · 设置：导出 / 导入存档、回到标题、放弃本局。
// 结算页“回看后台”是只读的（st.readOnly）：只留导出和回到标题，不能放弃、不能导入。
import * as E from '../../engine.js';
import { fmtDate } from '../../data/core.js';
import { esc } from '../fmt.js';
import { backToTitle, restartToTitle, enterGame } from '../flow.js';
import { toast, getWorld, setWorld, setState, getMp } from '../state.js';
import { roomCmd, isHost } from '../net.js';
import { safeLoadState, previewWorld, preflightSoloPostPlanSave, downloadText, saveKind, setRaw, markWorldLeave, SAVE_KEY } from '../storage.js';

const worldPlayer = world => {
  const pid = world?.settings?.you;
  return pid && world.companies?.[pid]?.kind === 'human' && world.companies[pid].s ? { pid, s: world.companies[pid].s } : null;
};

// 联机：存档在服务器上，浏览器里不导出、不导入；房主可以让服务器马上存一份。离开房间回标题（整页重载）。
function renderMp(m) {
  return `<h2>设置</h2><div class="card"><p>联机房间 <b class="mp-code">${esc(m.room)}</b>。进度存在服务器上：每 30 个游戏日自动存一份，大家都掉线时也会存；房间保留 14 天，可以分几个晚上打完。</p>
    <div class="menu-actions">${isHost(m) ? '<button class="btn" data-op="mp-save">让服务器现在存档</button>' : ''}<button class="btn" data-op="title">离开房间，回到标题</button></div>
    <p class="muted">离开以后公司会在 60 秒后交给电脑托管，回来就交还。</p></div>
    <div class="card"><p class="muted">本游戏中的模型名称、公司与事件取自公开信息，仅作背景；能力、跑分、收入、估值与股价均为游戏模拟，不代表真实数据。</p></div>`;
}

export function render(S, st = {}) {
  const m = getMp();
  if (m) return renderMp(m);
  const imp = st.importing;
  return `<h2>设置</h2><div class="card"><p>进度自动保存在这个浏览器里。想换一台电脑或换个浏览器接着玩，就先「导出存档」，到那边再「导入存档」。</p>
    <div class="menu-actions"><button class="btn" data-op="export">导出存档</button>${st.readOnly ? '' : '<button class="btn" data-op="import">导入存档</button>'}<button class="btn" data-op="title">回到标题</button>${st.readOnly ? '' : '<button class="btn btn--danger" data-op="abandon">放弃本局</button>'}</div>
    <input type="file" accept=".json,application/json" data-import hidden />
    ${imp ? `<div class="card"><b>要导入的存档：${esc((imp.s || imp.world?.companies?.[imp.playerId]?.s)?.company?.company || '自洽世界')} · ${fmtDate((imp.s || imp.world?.companies?.[imp.playerId]?.s)?.date || imp.world?.start || '2024-01')}${imp.world ? ' · 自洽世界' : ''}</b>
      <p class="muted">导入会替换这个浏览器里正在玩的这一局（${esc(S.company.company)} · ${fmtDate(S.date)}），替换后找不回来。</p>
      <div class="menu-actions"><button class="btn btn--danger" data-op="import-confirm">确认导入，替换当前这一局</button><button class="btn" data-op="import-cancel">取消</button></div></div>` : ''}</div>
    <div class="card"><p class="muted">本游戏中的模型名称、公司与事件取自公开信息，仅作背景；能力、跑分、收入、估值与股价均为游戏模拟，不代表真实数据。</p></div>`;
}

export function click(S, t, { st, draw }) {
  const op = t.closest('[data-op]')?.dataset.op;
  if (getMp()) {
    if (op === 'mp-save') return roomCmd('save').then(() => toast('服务器存好了')).catch(e => toast(e.message));
    if (op === 'title') return backToTitle();
    return;
  }
  if (op === 'export') {
    const world = getWorld();
    if (world) {
      const p = worldPlayer(world);
      return downloadText(`自洽世界-${p?.s.company.company || '我的公司'}-${p?.s.day || world.day}.json`, E.serialize(world));
    }
    return downloadText(`model-raising-${S.charId}-${S.date}.json`, JSON.stringify(S));
  }
  if (op === 'title') return backToTitle();
  if (st.readOnly) return;
  if (op === 'import') return t.closest('.card').querySelector('[data-import]')?.click();
  if (op === 'import-cancel') {
    st.importing = null;
    return draw();
  }
  if (op === 'import-confirm' && st.importing) {
    const r = st.importing;
    if (r.world) {
      // 预览已还原当前世界；确认时才正式安装候选的 Provider 和发布表。
      const text = E.serialize(r.world), check = preflightSoloPostPlanSave(text);
      if (!check.ok) return toast(`导入失败：${check.reason}`);
      // 再校验也必须先隔离 Provider：损坏的当前版本候选不能切走正在玩的世界。
      const verified = previewWorld(text);
      if (!verified.ok) return toast(`导入失败：${verified.reason}`);
      const loaded = E.migrateWorld(text);
      if (!loaded.ok) return toast(`导入失败：${loaded.reason}`);
      const p = worldPlayer(loaded.world);
      if (!p) return toast('导入失败：这份世界存档里找不到玩家经营的公司');
      setWorld(loaded.world);
      return enterGame(p.s, { persist: true });
    }
    const check = preflightSoloPostPlanSave(r.s);
    if (!check.ok) return toast(`导入失败：${check.reason}`);
    const loaded = safeLoadState(r.s);
    if (!loaded.ok) return toast(`导入失败：${loaded.reason}`);
    if (loaded.s.status !== 'playing') return toast('这份存档的那一局已经打完了，不能接着玩');
    // 选文件只预览；跨模式切换也必须等确认后再覆盖，写入失败不能刷新丢掉当前世界。
    if (getWorld()) {
      if (!setRaw(SAVE_KEY, JSON.stringify(loaded.s))) return toast('史实存档没有写成，请先导出当前存档，检查浏览器存储后重试');
      markWorldLeave();
      if (typeof globalThis.location?.reload === 'function') return globalThis.location.reload();
      setWorld(null);
    }
    return enterGame(loaded.s, { persist: true });
  }
  if (op === 'abandon') { const b = t.closest('[data-op]'); if (b.dataset.confirm) return restartToTitle(); b.dataset.confirm = '1'; b.textContent = '再点一次确认放弃'; }
}

// 选了文件：先读、先检查（走 safeLoadState，和启动、继续一样的规矩），没问题再让玩家确认，不会先把当前这一局弄丢。
export async function change(S, t, { st, draw }) {
  if (t.dataset.import === undefined || st.readOnly) return;
  const file = t.files?.[0];
  t.value = '';
  if (!file) return;
  // 新文件取代上一次预览；失败时不能留下可误确认的旧候选。
  delete st.importing;
  draw();
  let text;
  try { text = await file.text(); } catch { return toast('这个文件读不出来'); }
  const check = preflightSoloPostPlanSave(text);
  if (!check.ok) return toast(`导入失败：${check.reason}`);
  const kind = saveKind(text);
  if (kind === 'world') {
    const r = previewWorld(text);
    if (!r.ok) return toast(`导入失败：${r.reason}`);
    if (r.world.settings?.mp) return toast('联机存档不能替换单人局，请通过原房间查看复盘；离线复盘导入尚未支持');
    const p = worldPlayer(r.world);
    if (!p) return toast('导入失败：这份世界存档里找不到玩家经营的公司');
    st.importing = { world: r.world, playerId: p.pid, s: p.s, notes: r.notes || [] };
    return draw();
  }
  const r = safeLoadState(text);
  if (!r.ok) return toast(`导入失败：${r.reason}`);
  if (r.s.status !== 'playing') return toast('这份存档的那一局已经打完了，不能接着玩');
  st.importing = r;
  draw();
}
