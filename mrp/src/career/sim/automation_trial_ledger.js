// Lifecycle bookkeeping only, after an actual normal outcome/cancel. Never evaluates RNG.
export function recordAutoTrialOutcome(s,job,result) {
  if(![5,6].includes(s.automation?.version))return;
  const r=s.automation.pretraining.trials.find(x=>x.jobId===job.id&&x.status==='running');
  if(!r)return;
  r.status=result?.ok===true?'succeeded':'failed';r.finishedDay=s.day;
}
export function recordAutoTrialCancel(s,id) {
  if(![5,6].includes(s.automation?.version))return;
  const r=s.automation.pretraining.trials.find(x=>x.jobId===id&&x.status==='running');
  if(r){r.status='cancelled';r.finishedDay=s.day;}
}
