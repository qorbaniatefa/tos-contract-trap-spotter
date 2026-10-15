# Mini eval protocol

The checked-in `sources/` files are dated captures of five real public policies.
Each JSON metadata file has the official URL, language, retrieval timestamp,
character count and SHA-256. Linked documents are not included. Discord could
not be retrieved with valid TLS, so Mozilla Firefox terms replaced it.

`annotations/` contains 24 selected original paragraphs, including positive,
negative and ambiguous examples. These are excerpts, not an exhaustive annotation
of the five full policies. The source-spans map every excerpt back to the saved
document. Categories/labels were chosen by assistant source review, not by a lawyer.
Human review is recommended before interpreting these as an authoritative gold set.

The preparation command `npm.cmd exec -- tsx eval/prepare-cases.ts` refuses to
overwrite frozen cases. It verifies source hashes and builds excerpt hashes.
The runner also checks every annotation quote against its exact character range.
Do not revise labels or rules merely to improve the published frozen-set scores.

Run `npm.cmd run eval` with GEMINI_API_KEY configured locally. The runner makes
real Gemini calls, spaces the cases by 15 seconds, does not retry or fall back to
fixtures, and records every analysis failure. `successfulApiRequests` distinguishes
successful model calls from cached/mock data. Full key-bearing request headers,
raw errors, reasoning, and raw candidate responses are never persisted.

Matching requires the same category and overlapping evidence span, with maximum
one-to-one matching. Unmatched accepted findings are false alarms; unmatched
positive labels are misses. Negative examples are available for false-alarm
inspection. Ambiguous-category spans are excluded and reported separately.
Precision is TP/(TP+FP), recall TP/(TP+FN); zero denominators are undefined.

See [RESULTS.md](RESULTS.md) for the real run, and
[failure-analysis.md](failure-analysis.md) for representative failures.
`results/live.json` includes accepted findings, every missed label, false alarms,
rejection counts, source/excerpt hashes and coverage. The run contains five
successful API requests, but several individual reports are partial/inconclusive;
the aggregate `partial` status intentionally preserves that distinction.

The real run is not a claim of legal validity or a full-policy coverage test.
The small, selected sample and conservative category rules substantially limit
generalization. Source text rights remain with their respective publishers.
