import { AUTOMATION_MODULES, defaultAutomationModes, validateAutomationModes } from '../../data/automation_controls.js';
import { configureAutomationBatch, enablePostOnly } from '../../engine.js';
import { esc } from '../fmt.js';
export const defaultPlaySetup = (mode=null) => ({mode,modes:defaultAutomationModes(),selected:[]});
export const playSetupReady = d => !!d && ['post','full'].includes(d.mode);
export function validatePlaySetup(d) {
  if(!playSetupReady(d)) throw Error('请先选择「只后训练」或「完整玩法」');
  const modes=validateAutomationModes(d.modes);
  if(d.mode==='post' && Object.values(modes).some(v=>v!=='auto')) throw Error('只后训练预设的六项经营模块须保持自动；自选请切换完整玩法');
  return modes;
}
export function applyPlaySetup(s,d) {
  const modes=validatePlaySetup(d);
  if(d.mode==='post')enablePostOnly(s);
  const manual=Object.keys(modes).filter(k=>modes[k]==='manual');
  if(manual.length) configureAutomationBatch(s,{modules:manual,mode:'manual',expectedRev:s.automation.rev,requestId:'start:manual'});
}
// Draft-only: no state, save, timer or card-session mutation.
export function playSetupAction(d,action,value) {
  if(action==='mode' && ['post','full'].includes(value)) {
    if(d.mode==='full')d.fullModes={...d.modes};
    d.mode=value;d.modes=value==='post'?defaultAutomationModes():{...(d.fullModes||d.modes)};d.selected=[];return true;
  }
  if(d.mode!=='full')return false;
  const keys=Object.keys(AUTOMATION_MODULES);
  if(action==='select' && keys.includes(value))d.selected=d.selected.includes(value)?d.selected.filter(k=>k!==value):[...d.selected,value];
  else if(action==='preset' && ['auto','manual'].includes(value)){for(const k of keys)d.modes[k]=value;d.selected=[];}
  else if(action==='toggle' && keys.includes(value)){d.modes[value]=d.modes[value]==='auto'?'manual':'auto';d.selected=[];}
  else if(action==='all')d.selected=[...keys];
  else if(action==='clear')d.selected=[];
  else if(action==='batch' && ['auto','manual'].includes(value)){for(const k of d.selected)d.modes[k]=value;d.selected=[];}
  else return false;
  return true;
}
export function renderPlaySetup(d,{prefix='play-setup',multiplayer=false,disabled=false,compact=false}={}) {
  const act=(action,value='')=>`data-act="${prefix}" data-setup-action="${action}" data-setup-value="${esc(value)}"`;
  if(compact&&!multiplayer)return renderCompactPlaySetup(d,act,disabled);
  const editable=(multiplayer||d.mode==='full')&&!disabled,selected=d.selected||[];
  return `<section class="card play-setup" aria-label="${multiplayer?'我的经营托管':'选择玩法'}"><h3>${multiplayer?'我的经营托管':'先选择玩法'}</h3>
    ${multiplayer?'<p>这里只设置自己的六项经营托管；联机后训练由服务器结算，不选卡、不暂停等待，不改变房主时钟。</p>':`<div class="play-setup-actions" role="group" aria-label="玩法"><button class="btn ${d.mode==='post'?'btn--primary':''}" ${act('mode','post')} aria-pressed="${d.mode==='post'}">只后训练</button><button class="btn ${d.mode==='full'?'btn--primary':''}" ${act('mode','full')} aria-pressed="${d.mode==='full'}">完整玩法</button></div><p>${d.mode==='post'?'只后训练：专注于卡牌调优演练，日常算力租售、融资与经营由系统自动托管。':d.mode==='full'?'完整玩法：六项模块默认自动，可按需批量切换为手动；重大公司决策仍需你确认。':'请先选择一种玩法：只后训练自动经营，完整玩法可自由配置。'}</p>`}
    <p class="muted">${!multiplayer&&d.mode==='post'?'在正常资源与规则下托管日常运营，无需逐项处理各项经营页面，让您专注体验卡牌构筑。':'完整玩法/联机的批量开关覆盖这六项日常经营模块。购租显卡、融资等仍可手动操作，重大公司决策仍需你确认。'}</p>
    <div class="play-setup-modules">${Object.entries(AUTOMATION_MODULES).map(([id,label])=>`<button type="button" class="btn" ${act('select',id)} aria-pressed="${selected.includes(id)}" ${editable?'':'disabled'}>${selected.includes(id)?'☑ ':'□ '}${label}：${d.modes[id]==='auto'?'自动':'手动'}</button>`).join('')}</div>
    ${editable?`<div class="play-setup-actions"><button class="btn" ${act('all')}>全选六项</button><button class="btn" ${act('clear')}>取消选择</button><span aria-live="polite">已选 ${selected.length} 项</span><button class="btn btn--primary" ${act('batch','auto')} ${selected.length?'':'disabled'}>所选开启自动</button><button class="btn" ${act('batch','manual')} ${selected.length?'':'disabled'}>所选关闭自动</button></div>`:''}
    <p><b>${multiplayer?'后训练：服务器结算（不受此批量开关影响）':'后训练卡牌：默认手动（不包含在六项批量开关中）'}</b>${multiplayer?'':'；进入卡牌对局后，亦可选择自动出牌。'}</p>${disabled?'<p>已准备：先取消准备，再修改自己的托管预设。</p>':''}</section>`;
}

// Company selection keeps every required choice next to the start button.
function renderCompactPlaySetup(d,act,disabled) {
  const off=disabled?' disabled':'',entries=Object.entries(AUTOMATION_MODULES);
  const allAuto=entries.every(([id])=>d.modes[id]==='auto'),allManual=entries.every(([id])=>d.modes[id]==='manual');
  return `<section class="play-setup play-setup--compact" aria-label="玩法与自动化"><h3>玩法与自动化</h3>
    <div class="play-setup-choices" role="group" aria-label="玩法">
      <button type="button" class="btn play-setup-choice" ${act('mode','post')} aria-pressed="${d.mode==='post'}"${off}><b>只后训练</b><span>公司自动经营，你来选卡训练</span></button>
      <button type="button" class="btn play-setup-choice" ${act('mode','full')} aria-pressed="${d.mode==='full'}"${off}><b>完整玩法</b><span>经营与训练都参与</span></button>
    </div>
    ${d.mode==='full'?`<div class="play-setup-presets" role="group" aria-label="日常经营自动化"><b>日常经营</b><button type="button" class="btn" ${act('preset','auto')} aria-pressed="${allAuto}"${off}>全部自动</button><button type="button" class="btn" ${act('preset','manual')} aria-pressed="${allManual}"${off}>全部手动</button></div>
      <details class="play-setup-tuning"><summary>逐项设置${!allAuto&&!allManual?' · 已自定义':''}</summary><div class="play-setup-toggles">${entries.map(([id,label])=>`<button type="button" class="btn" ${act('toggle',id)} role="switch" aria-checked="${d.modes[id]==='auto'}" aria-label="${label}自动化"${off}><span>${label}</span><b>${d.modes[id]==='auto'?'自动':'手动'}</b></button>`).join('')}</div></details>
      <p class="play-setup-note">后训练卡牌默认手动；重大公司决策由你确认。</p>`:d.mode==='post'?'<p class="play-setup-note">日常经营自动进行，卡牌对局中也可以选择自动出牌。</p>':'<p class="play-setup-note" role="status">选好玩法，就能开始。</p>'}
    </section>`;
}
