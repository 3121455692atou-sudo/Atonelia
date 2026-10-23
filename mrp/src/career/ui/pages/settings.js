// 后台 · 设置：导出 / 导入存档、回到标题、放弃本局。
// 结算页“回看后台”是只读的（st.readOnly）：只留导出和回到标题，不能放弃、不能导入。
import * as E from '../../engine.js';
import { fmtDate } from '../../data/core.js';
import { esc } from '../fmt.js';
import { backToTitle, restartToTitle, enterGame } from '../flow.js';
import { toast, getWorld, setWorld, setState, getMp } from '../state.js';
import { roomCmd, isHost } from '../net.js';
import { safeLoadState, downloadText, saveKind, setRaw, markWorldLeave, SAVE_KEY } from '../storage.js';

const worldPlayer = world => {
  const pid = world?.settings?.you || Object.values(world?.companies || {}).find(c => c.kind === 'human' && c.s)?.id;
  return pid && world.companies?.[pid]?.s ? { pid, s: world.companies[pid].s } : null;
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
    // 世界存档的校验会当场换掉全局 Provider：取消导入时把它换回正在玩的这一局（或史实）。
    if (st.importing?.world) {
      const old = getWorld();
      if (old) {
        const back = E.migrateWorld(E.serialize(old));
        const pid = back.ok ? worldPlayer(back.world)?.pid : null;
        if (back.ok && pid) { setWorld(back.world); back.world.settings.you = pid; setState(back.world.companies[pid].s); }
      } else E.migrateWorld({});
    }
    st.importing = null;
    return draw();
  }
  if (op === 'import-confirm' && st.importing) {
    const r = st.importing;
    if (r.notes?.length) toast(`存档里有 ${r.notes.length} 条认不出的内容，已经丢掉`);
    if (r.world) {
      setWorld(r.world);
      return enterGame(r.s, { persist: true });
    }
    return enterGame(r.s, { persist: true });
  }
  if (op === 'abandon') { const b = t.closest('[data-op]'); if (b.dataset.confirm) return restartToTitle(); b.dataset.confirm = '1'; b.textContent = '再点一次确认放弃'; }
}

// 选了文件：先读、先检查（走 safeLoadState，和启动、继续一样的规矩），没问题再让玩家确认，不会先把当前这一局弄丢。
export async function change(S, t, { st, draw }) {
  if (t.dataset.import === undefined || st.readOnly) return;
  const file = t.files?.[0];
  t.value = '';
  if (!file) return;
  let text;
  try { text = await file.text(); } catch { return toast('这个文件读不出来'); }
  const kind = saveKind(text);
  if (kind === 'world') {
    const r = E.migrateWorld(text);
    if (!r.ok) return toast(`导入失败：${r.reason}`);
    const p = worldPlayer(r.world);
    if (!p) return toast('导入失败：这份世界存档里找不到玩家经营的公司');
    st.importing = { world: r.world, playerId: p.pid, s: p.s, notes: r.notes || [] };
    return draw();
  }
  const r = safeLoadState(text);
  if (!r.ok) return toast(`导入失败：${r.reason}`);
  if (r.s.status !== 'playing') return toast('这份存档的那一局已经打完了，不能接着玩');
  // 正在自洽世界里读一份史实存档：先把史实档写回主档，再整页重载（Provider、发布表回史实状态）。
  if (getWorld()) {
    setRaw(SAVE_KEY, JSON.stringify(r.s));
    markWorldLeave();
    if (typeof globalThis.location?.reload === 'function') return globalThis.location.reload();
  }
  st.importing = r;
  draw();
}
