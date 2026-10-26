// Pure lifecycle ledger, no engine/Provider/command/RNG imports.
// Deliberately excludes date, evaluation tier, naming, open preference and release
// counter: cancellation/style changes must not manufacture new model content.
export function evaluationContent(m){
  return JSON.stringify([m.id,m.mod??null,m.total??null,m.active??null,m.arch??null,m.scaleId??null,
    Object.keys(m.dims||{}).sort().map(k=>[k,m.dims[k]]),m.taint??null]);
}

export function cancelledEvaluationReceipt(s,ev){
  if(s.automation?.version!==6||!s.automation.modules?.evaluation)return null;
  const receipts=s.automation.evaluation?.receipts;
  if(!Array.isArray(receipts))throw Error('评测托管回执损坏，未撤回或改写原状态');
  const m=ev.cand||(s.models||[]).find(m=>m.id===ev.modelId);
  if(!m)return null;
  // Snapshot id ends in rN; content identity uses the original model id.
  const content=evaluationContent({...m,id:ev.modelId});
  return receipts.some(r=>r.content===content)?null:{content,modelId:ev.modelId,evalId:ev.id,day:s.day,cancelled:true};
}
export function recordCancelledEvaluation(s,receipt){
  if(receipt&&!s.automation.evaluation.receipts.some(r=>r.content===receipt.content))s.automation.evaluation.receipts.push(receipt);
}
