# M7 — actual evaluation/publication, six automatic modules

Independent branch based on the explicit frozen `game_qa_integration_cards/mrp` snapshot. Immutable comparison files are in `game_qa_autopilot_design/m7_base`; do not compare against a subsequently changed root tree. This branch does not merge/push the root candidate.

## Actual path

New automation/planner **version 6** adds `evaluation` to the existing five modules. New historical and solo-world entry defaults all six implemented modules to auto, with real per-module startup/manual controls. Other operations (hardware purchase, repair policy, financing etc.) are not advertised as automatic.

Only public advisor `op: {type:'act', action:'submit', arg:{modelId,tier,open}}` is considered. Candidate logic reconstructs an allowlisted ordinary `submitEval` call; it never passes through arbitrary advisor/client operation objects. The existing `evalTick` performs normal due-date publication and deployment. No shortcut `releaseNow`, `_finishEvalNow`, skipped tier, fake award or fake successful result.

`balanced` uses the public recommendation with no tier below the existing company default; `cautious` uses full evaluation and declines weak side releases. Both preserve current route/open-source policy, never force `replace`, never publish technology papers or alter license terms, and use ordinary legal naming/grant reservation. A blocked model (including pending cards) does not prevent trying another currently public submit suggestion for another legal model.

## Manual control and cards

- Evaluation auto blocks the editable release form, shows a read-only preview and explicit instructions to switch the module to manual in Automation (wait for MP ACK) before editing name/open/tier. DOM drafts are not invented server preferences.
- Manual stops new submissions only. An already submitted evaluation still publishes at its original due date; the UI says to use ordinary manual withdrawal if the player wants to stop it.
- Single-player calls the real read-only `postPlanBlocksAutomaticEval`. No recipe/draft/playing/ready/invalid, or a newer draft over an older active recipe, prevents automatic submission. Only the current active recipe permits it. No card opening, confirmation, control switch, card choice, recipe generation or activation is done by economic automation.
- MP skips this check based on actual authoritative Provider/world mode, not client context. MP has no card waits.
- Small models with an existing posttraining job, including paused ones, are not submitted automatically because normal submission would remove that job. Main-model snapshot evaluation leaves its ongoing job alone.

## Safety, costs and persistence

Read-only preflight uses legal submitBlock/releaseNamePlan/releaseLine/route on a clone. It **does not invoke submitEval on a clone**: Provider.claimName would still touch the real world. The one authoritative normal submit handles name races and legal checks.

Submission currently has zero instant cash fee and no GPU occupation; ongoing company costs and existing training cash holds remain. No invented budget or financing. Candidate names, current route and open/closed consequence, normal duration and automatic-publication consequence appear in the operation explanation.

Content receipts contain modelId, canonical capability/structure/taint fingerprint, actual evalId and day. They exclude date, tier, name, open-choice and release counter from the content key. Cancel/reconnect/toggle/strategy changes cannot automatically resubmit the same content; real subsequent training changes can. Manual submission remains the original legal API. Unknown/malformed/future receipt dates reject unchanged.

The known public deadline is checked without future-event access: normal due date must not exceed the actual world.end, or the last day of historical END month. Completion on the final ordinary evalTick date is allowed. Impossible automatic evaluations wait explicitly, with no shortened tier, default skip or world extension. Manual API is unchanged.

All MP decisions remain in the one recorded authoritative tick. root clockRulesVersion, MP random-post rules/seed fields, session allocation/activation order, active NPC takeover fixes and live SSE/pending/focus synchronization are retained.

## Evidence

All evidence is under `game_qa_autopilot_design/`.

- `m7-end-to-end-first.jsonl`: **original resources, fixed seed13, real product card format**. DeepSeek: Jan1 tune → Jan9 pretraining → May12 new-model player six basic card choices + normal post job → Jun16 auto evaluation → Jun23 normal release. Kimi: Jan1 tune → Jan8 pretraining → Mar16 player cards/post → Apr24 evaluation → May1 release. Lowest cash 864,906,614 and 823,760,614 respectively, both playing. No cash/know/findings/dimensions injection. QA event responses use existing resolveAll, so cash includes ordinary events/revenue; production planner never resolves inbox or finances secretly.
- `m7-natural-second.jsonl`: original-resource non-card baseline models actually evaluated/published; this is not misrepresented as the product manual-card proof (use the preceding artifact for that).
- `m7-mp-natural-second.jsonl`: original-resource two-human major companies, real MP random-post; first real automatic evaluation on May31.
- `m7-wal-first.txt`: 9/9 including natural MP submission, real name ledger, full WAL replay, snapshot continuation to actual publication and identical final hash.
- `m7-focused-first.txt`: 98/98 existing automation/card product/session/HTTP recovery.
- `m7-deadline-first.txt`: 18/18 including deadline boundary, original manual capability and real MP mode/restart.
- `m7-focused-with-deadline.txt`: final complete current-code automation, cards, lab, command, UI, HTTP/recovery suite; see final result summary.

Failure evidence is preserved: initial natural probe selected the wrong advisor operation shape and correctly did nothing; corrected to the actual act/submit shape. First card test let auto submit before its assertion, then tried to re-unlock an already unlocked dpo fixture; corrected test control/fixture, not unlock rules. Initial broad 373-test run had two test-only errors: stale expected latest version and missing restoreHistory after world singleton changes; fixed isolation/schema assertions. No rules relaxed to pass.

## Integration

Apply `m7-from-frozen-root.patch` only against its manifest, preserving any newer root changes. Relevant release-panel change is isolated from training live-update work. This implementation does not include unrelated product modality-preflight files changed by root after the freeze. Do not whole-directory-copy it over root.

This is the final functional expansion for this round. Follow-up is integrated UI and end-to-end/cash/resource/control verification, not more finance or hardware automation modules.
