# Submission demo

[Download or view the Cypress demo](demo.mp4) — 67.24 seconds, approximately 5.7 MB.

The actual extension capture and report run in a test-only localhost frame. The
video shows a source-backed automatic-renewal finding and an inconclusive result
when a fabricated quotation is rejected. Controlled provider responses are clearly
labelled; this video is not a live Gemini evaluation or a production toolbar test.

Reproduce with `npm.cmd ci`, `npm.cmd run browser:install`, then
`npm.cmd run demo:record`. The recording script checks the resulting MP4 duration
using Chrome. The maximum allowed length is 90 seconds.

- `video-verification.json`: metadata check for this recording.
- `gemini-verification.json`: sanitized real API connectivity, structured-output,
  source-quotation, scoring, and authentication-error checks.
- [Actual five-policy results](../eval/RESULTS.md): 7 detected, **9 missed**, 0 false
  alarms. These results have not been replaced with fixture metrics.

Production toolbar/activeTab interaction remains a manual check described in the
main README. Download the MP4 and upload it separately to the university portal
if a separate video submission is required.
