# Batch 3 — Kimi, Mistral, Llama expression integration

## Scope and application

Adds **8 original PNGs + 24 WebP thumbnails**: Kimi `determined/worried`, Mistral and Llama `determined/happy/worried`. Kimi's existing happy image and mapping, all neutral assets, and all other characters remain unchanged.

The immutable two-text-file baseline in `../base/` is **original M4 + DeepSeek Pro + batch 2 GPT/Gemini/Claude**. This increment does not re-add prior assets or canonical entries. Copy only this package's new `assets/` and `docs/` paths, then check/apply **both** `roster.batch3.patch` and `art-manifest.batch3.patch` from the target MRP root. The canonical patch is required by the existing roster hash-integrity test. Runtime emotion-state mapping/browser acceptance are separate root integration work.

The 8 PNGs are byte-identical selected built-in imagegen outputs. The original unmodified `scripts/make_thumbs.py` was executed against this isolated asset root; only format/size derivation occurred. No image painting, stretch/crop repair, neutral replacement, card-atlas edits or production changes.

## Dimensions

| Asset | Original PNG | Stage WebP | Card WebP | Face WebP |
|---|---|---|---|---|
| Kimi determined | 941×1671 | 649×1152 | 270×480 | 160×160 |
| Kimi worried | 941×1672 | 648×1152 | 270×480 | 160×160 |
| Mistral all 3 | 937×1678 | 643×1152 | 268×480 | 160×160 |
| Llama all 3 | 937×1678 | 643×1152 | 268×480 | 160×160 |

Kimi determined's native generated canvas is 1 px shorter than neutral; the unchanged thumbnail pipeline consequently rounds stage width to 649 rather than 648. This is documented, not silently normalized. The selected Llama determined matches original 937×1678 framing; the earlier 980×1605 candidate was rejected and retained outside integration.

## Verification

- All 8 full PNGs and all 8 face thumbnails individually visually inspected: correct identities, clothing, original poses, transparent background, distinct focused/success/worried expressions. Llama's original raised sleeve still partly covers one eye; the visible eye/brow/mouth conveys the expression.
- `evidence/url-validation.json`: **48/48** logical asset URLs exist and decode with dimensions/alpha/hash; 32 new files + 16 unchanged dependencies (neutral and existing Kimi happy). Filesystem evidence, not an HTTP/browser claim.
- `evidence/patch-and-canonical-validation.json`: both patches dry-run and actually apply to temporary two-file copies; roster imports; **77 roster PNG references** match canonical hashes; exactly 8 new canonical records; no duplicates; every previous record/license note and existing Kimi happy mapping unchanged; original CREDITS covers every manifest entry.
- `SHA256SUMS`: **32/32** packaged image hashes pass; `evidence/protected-source-{before,after}.json` unchanged.
- Local build/validation paused during the parent's performance window and resumed only after explicit notice. No simulations or production modifications.

## Attribution

All three original designs/art references are credited to **ZipZipPipe**. Existing usage statement: **未检得统一再授权声明；本机个人体验**. No blanket commercial or open license is invented; the separate whale-character CC BY-NC-SA statement is not applied here. These are AI-assisted expression derivatives of credited existing designs, not wholly original character creations.

- Kimi: https://www.bilibili.com/opus/1233069202138464289
- Mistral / Llama: https://www.bilibili.com/opus/1236803362705375305

Original source records, exact generation prompts, output provenance and canonical source-neutral hashes are retained under `docs/character-expression-derivatives/batch3_kimi_mistral_llama/` and the canonical patch.
