# Live Gemini mini evaluation

Run: 2026-10-15T00:59:49.846Z. Model: gemini-3.5-flash-lite. Status: partial. Actual successful API requests: 5/5.

Selected original paragraphs from five real policies; not full-policy legal validation. Gold annotations were frozen before model requests and were reviewed by the assistant, not a legal expert.

| Source  | Analysis     | Detected (TP) | Missed (FN) | False alarms (FP) | Processed capture |
| ------- | ------------ | ------------: | ----------: | ----------------: | ----------------: |
| spotify | partial      |             2 |           2 |                 0 |              100% |
| google  | inconclusive |             0 |           3 |                 0 |              100% |
| dropbox | partial      |             3 |           2 |                 0 |              100% |
| github  | complete     |             2 |           1 |                 0 |              100% |
| mozilla | inconclusive |             0 |           1 |                 0 |              100% |

Aggregate TP=7, FN=9, FP=0; precision=1.000, recall=0.438. Ambiguous labels are excluded from scored matching and listed separately. Missing output and rejected candidates remain visible in live.json.

The full accepted quotations, detected/missed annotations and false alarms are in eval/results/live.json. Metrics include failures; a partial analysis does not become a safe contract. Do not tune the frozen set after viewing these results.
