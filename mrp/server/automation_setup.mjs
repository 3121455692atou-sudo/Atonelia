// Per-seat choices, recorded in room.start before creating the world. No clocks,
// cards, financing or player commands are inferred from this payload.
import {validateAutomationModes} from '../src/career/data/automation_controls.js';
import {configureAutomationBatch} from '../src/career/sim/automation.js';
export function validateAutomationSetup(args) {
  if(args.automationSetup===undefined)return; // No implicit changes to a recorded start.
  const rows=args.automationSetup,s=args.settings;
  const count=s?.mode==='fork'?s.seats?.length:s?.companies?.filter(c=>c.kind==='human').length;
  if(!Array.isArray(rows)||!Number.isSafeInteger(count)||rows.length!==count)throw Error('开局托管预设与真人座位不匹配');
  rows.forEach((r,i)=>{
    if(!r||typeof r!=='object'||Object.keys(r).length!==2||r.seat!==i)throw Error('开局托管预设座位不合法');
    validateAutomationModes(r.modes);
  });
}
export function applyAutomationSetup(world,args) {
  validateAutomationSetup(args);
  for(const row of args.automationSetup||[]) {
    const c=Object.values(world.companies).find(c=>c.kind==='human'&&c.seat===row.seat);
    if(!c?.s)throw Error('开局托管预设找不到真人公司');
    const manual=Object.keys(row.modes).filter(k=>row.modes[k]==='manual');
    if(manual.length)configureAutomationBatch(c.s,{modules:manual,mode:'manual',expectedRev:c.s.automation.rev,requestId:`start:seat:${row.seat}`});
  }
  return world;
}
