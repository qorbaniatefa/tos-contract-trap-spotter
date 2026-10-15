# Gemini backend setup and verification

The local Node backend uses `GEMINI_API_KEY`. The extension never receives it.
Do not paste credentials into chat, source files, command arguments, screenshots,
issues, logs, or GitHub. `.env` and `.env.*` are ignored; `.env.example` has no key.

1. Install Node.js 24 and run `npm.cmd ci` from the project directory.
2. Run `npm.cmd run setup`. This creates `.env` with a random pairing token, or
   adds missing Gemini fields without replacing existing values.
3. Open `.env` in your local editor. Set `GEMINI_API_KEY` to your key there.
   Keep `GEMINI_MODEL=gemini-3.5-flash-lite` unless your project has different
   model access. Never put the key in a `VITE_` variable.
4. Run `git check-ignore .env` (must print `.env`). Run `npm.cmd run verify:gemini`.
   Exit 0 and `status: passed` mean a real keyed Gemini request succeeded, its
   JSON passed Ajv, an automatic-renewal quotation matched the original, score
   was computed locally, fabricated evidence and malformed JSON were rejected,
   missing-key handling passed, and a real invalid-key request was rejected.
   `requestsSucceeded` counts real successful API calls, not mock responses.
5. Run `npm.cmd run test:unit`, `npm.cmd run typecheck`, and `npm.cmd run build`.
   These checks do not prove live connectivity. Unit tests simulate 400, 401,
   403, 404, 429, 500/503, refusal, network failure and oversize responses.
6. Load `dist/extension` using Chrome's `chrome://extensions` → Developer mode →
   Load unpacked. Copy its ID to `.env` as
   `EXTENSION_ORIGIN=chrome-extension://<your actual ID>`.
7. Run `npm.cmd run server`. On an HTTP/HTTPS policy page, click the extension.
   In “Servis bağlantısı”, enter the `.env` **PAIRING_TOKEN**, not the API key.
   Preview the captured text and click “Analiz et”.
8. Run `npm.cmd run eval` for the separate five-policy live evaluation after
   annotations are frozen. Its results remain pending until actual requests
   succeed; the connectivity smoke test does not complete that deliverable.

The verifier writes only sanitized outcomes to `artifacts/gemini-verification.json`.
It does not persist the key, raw HTTP errors, prompts, or raw model responses.
An unset key exits nonzero with `pendingKey` without making a network request.
Authentication/model/quota failures exit nonzero and are never reported as zero risk.

## Model and API choice

Checked 2026-10-15: Google's official [model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
lists stable `gemini-3.5-flash-lite` with structured outputs. Its
[pricing page](https://ai.google.dev/gemini-api/docs/pricing) lists a free tier.
Project quotas and access still vary; check your own AI Studio quota page.

The backend uses the native [Interactions REST API](https://ai.google.dev/api/interactions-api),
`x-goog-api-key` authentication, no tools, and `store: false`. Its
[structured output](https://ai.google.dev/gemini-api/docs/structured-output)
generation schema keeps the same required fields, types and category enums.
Bounds, metadata and additional-property constraints are enforced by the complete
committed Ajv schema locally; the generation schema uses a smaller compatible subset.
The key is never put in a URL or any browser request. Redirects are rejected.

The free tier has project-specific request/token quotas. There is no automatic
retry, billing change or paid-model fallback. For `quotaExceeded`, wait and
check [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits); for
`authentication`, check your local key and project restrictions; for
`modelUnavailable`, check model access. Errors are sanitized before logging.

Free-tier data handling is governed by Google's terms; `store: false` disables
interaction history, not all provider-side data use. Use public policy texts for
this assignment; review the provider's terms before submitting private content.
