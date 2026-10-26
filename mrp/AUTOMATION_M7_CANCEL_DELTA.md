# Required post-M7 correction: protocol + uniform cancellation

Apply after the immutable M7 patch, not instead of it. Original M7 `375 PASS` did **not** prove its new module's public configuration protocol: its new tests directly called configureAutomation, and the COMMANDS module enum was still missing evaluation. This was a real UI/MP takeover blocker, not a cosmetic test issue.

## Changes

- Add only `evaluation` to the normal configureAutomation module allowlist. Existing runtime per-version/preset/ownership/revision checks remain; unknown module still rejects without mutation.
- Move content fingerprint to an import-free lifecycle helper. No circular engine or Provider imports.
- Normal cancelEval, regardless of manual/automatic origin, computes the actual frozen candidate fingerprint using its original model id, validates new v6 receipt shape before mutating, and records only after the ordinary cancellation/name release succeeds. Small candidates use their actual frozen model. Existing same-content receipt is reused; no duplicate purchase/release.
- Only version6 with a real evaluation module gains this bookkeeping. Old no-module games get no added fields. Explicit manual resubmission remains available, while toggles/reload/new day cannot cause automatic same-content resubmission. Real subsequent posttraining content change can regain auto eligibility.
- M7 tests now configure through the public applyCommand, not the internal function. Exact-deadline fixture uses a separate uncancelled model, preserving uniform cancellation semantics.

## Evidence

`game_qa_autopilot_design/m7-cancel-protocol-final.txt`: **128/128 PASS**, one worker, 6.15 seconds.

Includes:
- All six actual current module keys each pass public-command manual/auto; unknown key rejects unchanged.
- Real HTTP/SSE two connections to same player: evaluation auto→manual→auto/cautious→manual; reconnect/server restart preserves rev3/manual/cautious; repeated semantic request does not roll state back.
- API manual submit→other controller sets auto→cancel→day/reload cannot resend same content.
- Explicit manual resubmit still succeeds; repeated cancellation creates one semantic receipt.
- Real later posttraining changes content and permits a new automatic evaluation.
- Original-resource MP public candidate manually submitted, mode switched, cancelled, then full WAL replay and snapshot continuation reproduce receipt/hash exactly.
- Existing M7 card-control, natural evaluation/publication, public deadline, original commands contract.

Earlier failures remain in m7-cancel-second.txt: the public-command test exposed the missing module allowlist; the old exact-deadline test reused deliberately cancelled content and was correctly blocked by the new rule. No cancellation rule was relaxed to make it pass. The original eval regression cases in that mixed run passed, but the mixed run itself was not all-green.

Scope does not expand automation beyond six modules. No root files, published patch, gains, world deadlines, card permissions or hardware/financing actions changed.
