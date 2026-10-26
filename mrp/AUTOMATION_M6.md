# M6 — safe tune trial → real finding → pretraining

Independent incremental slice on M5, not merged into the root candidate. New automation/planner version 5; still five real modules. `pretraining` now covers a public tune trial and the existing public project path. Version 1–4 behavior does not acquire this new action.

## Implementation

- `automation_trial.js`: only current public advisor `trial` / `tune` / small-or-mid; canonical plan whitelist; actual `jobCheck` + delivered-card allocation; no `setPlan`, future-RNG inspection, financing, card purchases or posttraining commands.
- One ordinary `startJob({kind:'trial',type:'tune',size,plan})`; a successful command gets a company/generation/job receipt. Existing trials/base jobs including paused ones are preserved. A different saved player plan blocks the action rather than being overwritten.
- Existing M5 coarse policy changes maximum project duration, resource share protected for running tasks, and cash buffer. Trial must fit 30 days and its public target must also fit the selected project duration. Monthly cost stress quote includes already committed orders/loan interest; no forecast revenue is credited. Trial + current target-project duration are protected together; use max with existing 12-month reserve, not sum.
- `automation_trial_ledger.js` is bookkeeping only. `jobs.js` records the **already computed** ordinary `finishTrial` result and ordinary manual cancellation. No trial success/benefit/seed changes. No synthetic finding.
- At most two automatic tune attempts per main generation, second only after a real failure + 7 game days. Cancelled, succeeded, or unexpectedly disappeared running trial never automatically rerolls. Different strategy/plan, toggles, reload and job id changes do not reset the generation ledger.
- Manual takeover does not cancel/pause an existing job or remove its cash hold. Ordinary completion may still occur; no subsequent automatic project while manual.
- MP remains one recorded authoritative tick path, no second automatic command WAL. Existing strict request receipts are retained. No posttraining card session/control writes.
- UI explicitly distinguishes version-4 project-only from version-5 tune support, bounded retry, cancellation behavior and unimplemented compute purchasing.

## Validation artifacts

Under `game_qa_autopilot_design/`:
- `m6-natural-first.jsonl`: original resources, fixed seed 13. DeepSeek 2025 trial success Jan8 → project Jan9; Kimi/Suno Jan7 → Jan8; each next day has real pretraining FLOP progress. image2 2023 starts direct project Jan1 and progresses Jan2.
- `m6-natural-160d.jsonl`: same four cases through 160 days, all still playing and positive cash. This QA uses existing `resolveAll` for event choices; normal events/income may affect ending cash. It is not a claim that no event financing happened. The production planner does not call resolveAll.
- `m6-focused-first.txt`: 20/21 initial; test incorrectly expected advisor-only `open` field in tune spec. Corrected test to assert exact allowed training configuration, no engine relaxation.
- `m6-focused-second.txt`: 74/74 automation/HTTP/SSE/SIGKILL/day30 snapshot tests.
- `m6-wal-first.txt`: 9/10; fixture assumed historical fork immediately has public tune advice. Actual fork correctly waited. Replaced fixture with original-resource zero-start major companies, without injecting findings/resources.
- `m6-lifecycle-second.txt`: 21/21 including actual dual-human nonempty trial receipt full-WAL and snapshot continuation + original lab tests.
- `m6-lifecycle.txt`: intentionally interrupted wider jobs regression because its first case simulates 96 entire campaigns. Not a passing result.
- `m6-focused-final.txt`: final current-code automation/lab/command/UI/MP regression, inspect final summary.

Prepared-state tests explicitly label artificial failed receipts to test cooldown/cap; natural closure cases use no such fixture. Shared slots limited to one own test worker.

## Integration

Apply incremental `m6-from-m5.patch`, not an entire branch copy. Keep root host-clock/random-post fields alongside `automationVersion:5` in both room.start sites, and keep UI agent SSE synchronization fixes. The only original jobs changes are lifecycle hooks; preserve root card-session gating and posttraining numerical adaptations. No main-candidate or remote write was performed.

Next necessary automation slice: evaluate/publish from legal public suggestions while preserving existing player open/closed route and evaluation jobs. Not implemented or advertised by M6.
