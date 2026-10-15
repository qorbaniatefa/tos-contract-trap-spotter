# Observed v1 failures

The frozen run made five successful real Gemini calls. It detected 7 of 16
positive labels, missed 9, and produced 0 accepted false alarms on these excerpts.
Precision 1.000 on this small set must be read alongside recall 0.438. Rejecting
uncertain candidates avoids unsupported claims but also removes useful findings.

| Source           | Representative miss                                               | What can be established                                                                                                                  |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Spotify          | Ongoing subscription billing described as “continue indefinitely” | The v1 renewal rule requires an explicit automatic-renewal trigger. This semantic wording can be missed.                                 |
| Dropbox          | Automatic periodic billing and legally limited refunds            | The source contains the annotated clauses; the final report omitted them. Renewal wording falls outside the narrow v1 trigger.           |
| Google (Turkish) | Conditional personalized ads and sharing/transfer paragraphs      | Four candidates were rejected and no supported finding survived. The UI correctly withheld a reassuring zero score.                      |
| GitHub           | One of two separately annotated refund restrictions               | The other refund clause was detected. The omitted candidate's exact failure stage cannot be established from the accepted-only artifact. |
| Mozilla          | Updating terms with continued-use acceptance                      | “May decide to update” is outside the v1 change/modify/amend trigger. The report was inconclusive.                                       |

Raw candidate responses were not retained, so not every miss can be attributed
to the model, quote boundary check, or category rule. Do not invent stage-specific
explanations. A later diagnostic version could record sanitized rejection reasons
without retaining raw provider responses.

There were no accepted false alarms, including on the selected cancellation,
opt-out, and user-plan-change counterexamples. This is not evidence that all
negative clauses or all prompt injections are handled correctly.

The prompt-injection browser fixtures separately prove that common hidden HTML
instructions are excluded, visible instructions do not obtain tools/credentials,
and malformed or unsupported fixture responses cannot produce scored claims.
They use controlled responses and do not measure a live model's resistance to
finding suppression. Live attack-versus-clean comparison remains a distinct test.

No category rules were tuned after inspecting these frozen results. Subsequent
review fixes concern capture whitespace, session invalidation and chunk count;
they do not change the v1 category scoring or these already-frozen excerpt inputs.
