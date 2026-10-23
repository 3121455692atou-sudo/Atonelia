// 发布面板里“名字”那一行（P3.U2，规格 C1、C2、C7）：起名、实时校验、使用史实型号名。
// 名字在送评时定（C7）：这里填的值由 panels/release.js 的 pick 交给 submitEval 的 opts.name，授权由 opts.grant 交出去。
// 默认值只有一个出处：releaseNamePlan（发布预告和 submitEval 用它，所以两边一致）。校验原因也全用引擎的（validateModelName、
// releaseNamePlan），界面不另写规则；输入框下面那行就是引擎给的 reason，原样显示。
// m 是要发布的模型，role 是它所在的流水线（'flagship' 训练线、'small' 小模型线）。
// opts：{ line：'main'|'prev'|'small'（只给输入框起 id）、replace：勾了顶替、open：开源一行的当前值、name / grant：重画时带上玩家已经填的 }。
import * as E from '../../engine.js';
import { esc } from '../fmt.js';

const PIPELINE_ROLE = m => (m?.role === 'small' ? 'small' : 'flagship');
// 勾选史实型号名时，名字框里应该是哪个名字：授名本身，或者玩家已经填的 series 变体。
function grantName(S, m, grant) {
  const hn = E.grantsFor(S, PIPELINE_ROLE(m)).find(h => h.id === grant);
  if (!hn) return null;
  const series = typeof hn.series === 'string' && hn.series.trim() ? hn.series.trim() : null;
  return { hn, series, locked: !series };
}
// 输入框现在这个名字的检查结果（引擎口径）：
// 选了授名就走 releaseNamePlan（核 series、授名条件、重名），没选授名就按 C1 的 validateModelName。
// 空名字直接走 validateModelName，好让“名字不能是空的”原样出来（releaseNamePlan 会把空名字当成“没填”，换建议名）。
export function checkName(S, m, raw, opts = {}) {
  if (!m) return { ok: false, name: '', reason: '没有要发布的模型' };
  if (!String(raw ?? '').trim()) return E.validateModelName(S, raw, { role: PIPELINE_ROLE(m), modelId: m.id });
  const replace = !!opts.replace;
  return E.releaseNamePlan(S, m, {
    name: raw, grant: opts.grant || null, replace, open: opts.open,
    line: E.releaseLine(S, m, { replace }),
  });
}

export function render(S, m, role, opts = {}) {
  if (!m) return '';
  const key = m.id;
  const replace = !!opts.replace;
  const open = typeof opts.open === 'boolean' ? opts.open : undefined;
  // opts.grant：undefined = 第一次画（按引擎的预填顺序）；null = 玩家明确不用授名；id = 选了这个授名。
  let grant = opts.grant;
  let name = opts.name;
  let plan;
  if (grant === undefined) {
    plan = E.releaseNamePlan(S, m, { replace, open });
    grant = plan.grant ?? null;
    name = plan.name ?? '';
  } else if (grant) {
    const g = grantName(S, m, grant);
    plan = E.releaseNamePlan(S, m, { name: name ?? '', grant, replace, open });
    if (!name) name = plan.name ?? g?.hn.name ?? '';
  } else {
    plan = E.releaseNamePlan(S, m, { name: name ?? '', grant: null, replace, open });
    if (!plan.ok && !name) name = '';
  }
  const picked = grant ? grantName(S, m, grant) : null;
  const checkRole = E.releaseLine(S, m, { replace }) === 'main' ? 'flagship' : 'small';
  // 勾了授名、但换了发布角色后条件不再满足时，不锁名字框（否则玩家连改都改不了），让上面那行原因提示换一个名字或取消勾选。
  const pickedOk = !!picked && E.nameGrantCheck(S, m, grant, { role: checkRole, open }).ok;
  const locked = !!picked?.locked && pickedOk;
  const probe = checkName(S, m, name, { grant, replace, open });
  const err = probe.ok ? '' : probe.reason;
  const grants = E.grantsFor(S, PIPELINE_ROLE(m));
  const list = grants.map(hn => {
    const c = E.nameGrantCheck(S, m, hn.id, { role: checkRole, open });
    const on = grant === hn.id && c.ok;
    const series = typeof hn.series === 'string' && hn.series.trim() ? hn.series.trim() : null;
    return `<div class="grant-opt ${on ? 'is-on' : ''}">
      <label class="grant-head"><input type="checkbox" data-grant="${esc(hn.id)}" ${on ? 'checked' : ''} ${c.ok ? '' : 'disabled'} />
        <b>${esc(hn.name)}</b>${series ? `<small>也可以用「${esc(series)}」开头的变体</small>` : ''}</label>
      <ul class="grant-lines">${c.lines.map(l => `<li class="${l.ok ? 'ok' : 'bad'}"><span class="mark">${l.ok ? '✓' : '✗'}</span><span>${esc(l.text)}<small>现在：${esc(l.now)}</small></span></li>`).join('')}</ul>
    </div>`;
  }).join('');
  const grantBox = grants.length ? `<div class="rel-grants" data-grant-box>
      <b>使用史实型号名</b>
      <small class="muted">拿到授权才能用；条件全部满足的才能勾，勾上以后名字就锁定成这个型号名。</small>
      ${list}</div>` : '';
  const seriesHint = picked?.series && !locked ? `<small class="muted">名字要么就是「${esc(picked.hn.name)}」，要么以「${esc(picked.series)}」开头。</small>` : '';
  return `<div class="rel-name">
    <label class="rel-name-field"><b>名字</b>
      <input type="text" id="rel-name-${esc(key)}" data-rel-name value="${esc(name)}" maxlength="32" ${locked ? 'readonly' : ''} data-ok="${probe.ok ? '1' : '0'}" autocomplete="off" />
      <small class="muted">发布以后名字就冻结了；史实型号名要靠公司策略授予。</small>${seriesHint}</label>
    <p class="rel-name-err" data-name-err ${err ? '' : 'hidden'}>${esc(err)}</p>
    ${grantBox}
  </div>`;
}
