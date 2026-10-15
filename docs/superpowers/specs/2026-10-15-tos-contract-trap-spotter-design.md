# ToS / Contract Trap Spotter: proposed architecture

Status: DRAFT — awaiting user approval. This document authorizes no implementation.

## Recovered starting point

The earlier conversation supplied the assignment and proposed a Chrome extension,
local demo, evaluation, and Cypress recording. That proposal was not approved.
The repository contains AGENTS.md and an initialized local Git repository, with
no application scaffold. This document continues that planning; all technical
choices below are recommendations, not previously agreed decisions.

## Intent and success criteria

Help someone reading terms of service, a privacy policy, or subscription terms
find clauses worth closer attention. Show original quotations and plain Turkish
explanations, a reproducible risk indicator, and honest limits on coverage.
The persistent notice is: “Bu uygulama hukuki tavsiye vermez.”

The assignment prioritizes a working demo (30), evaluation quality (30), security
(20), and architecture/code (20). Scope therefore favors traceable evidence and
measured failures over autonomous browsing or extra features.

Required deliverables are a Chrome extension, README with architecture and data
flow, at least five real-policy evaluations with detected/missed/false-positive
clauses, security fixtures, and a Cypress-recorded demonstration of at most 90
seconds showing success and uncertainty. A GitHub repository is a later delivery
action; the earlier instruction prohibits creating one or pushing for now.

## Recommended system boundary

Use TypeScript throughout, a Manifest V3 extension, a local Node.js analysis
service, JSON Schema validated with Ajv, Vitest for unit tests, and Cypress for
browser scenarios. Use Vite for browser bundles and ESLint/Prettier with two-space
indentation. Select and pin compatible versions during implementation.

Generate standalone Ajv validators at build time for the extension so runtime
validation requires no Function constructor or relaxed content security policy.
The service may compile the same committed schemas at startup.

The service introduces a local startup step but keeps the provider key out of
extension bundles, page scripts, browser storage, and captured content. A direct
extension-to-provider design is simpler to launch but exposes a stored browser
credential. A hosted service adds accounts, deployment, and retention concerns.
The local service is the recommendation for this assignment.

The first version analyzes user-invoked, rendered HTML documents. The user opens
a policy and clicks the extension action, previews the extracted text and the
provider disclosure, then selects “Analiz et.” No automatic background capture
or transmission. Always-on detection would require a separate permission decision.

PDFs, OCR, closed shadow roots, cross-origin frames, login flows, opening collapsed
sections, automatically following policy links, and autonomous page actions are
outside the first version. Report these capture limits when observable. Language
support starts with Turkish and English sources, with Turkish report text.

## Components and data flow

1. **Capture adapter, src/extension/capture/**: runs on the user-invoked tab in
   Chrome's isolated world. Locates main/article content or a user-selected text
   range, falling back to rendered body text with an explicit scope warning.
   Excludes scripts, styles, comments, hidden/inert content, form values, editable
   fields, and extension UI. Collects visible rendered text throughout the chosen
   region, not only the current viewport. Never captures cookies or storage.
2. **Capture snapshot**: freezes source text, title, URL, capture time, region,
   exclusions, and a SHA-256 digest. URL query strings and fragments are stripped
   from transmitted metadata. The preview shows exactly what will be submitted.
   DOM text runs map to snapshot offsets; quotations preserve source characters.
3. **Background coordinator, src/extension/background/**: validates message
   shapes and senders, associates each capture with tab/document identity and a
   random request ID, and opens the extension report page. It does not perform a
   long LLM call whose state depends on a service worker staying awake.
4. **Report controller, src/extension/report/**: holds the snapshot in extension
   session storage and submits it directly to the local service after the user's
   analysis action. A regular extension report tab avoids popup lifetime issues.
   The report page owns cancellation and clears superseded requests. Analysis
   results remain tied to the original snapshot if the source page changes.
5. **Local service, src/server/**: validates bounded input, chunks the document,
   calls a configured LLM, validates responses, verifies evidence, merges findings,
   and computes the score. It accepts text, never a URL to fetch. Provider URLs
   and model IDs come only from operator configuration, never captured content.
6. **Shared analysis modules, src/analysis/**: JSON schemas, category rules,
   quotation validation, deterministic explanations, merging, scoring, and shared
   report types. The extension rechecks the returned report and its quotations
   against its own snapshot before rendering.
7. **Report rendering**: displays only accepted findings as escaped text, with
   a category, exact original quotation, Turkish explanation, and source span.
   The report displays source metadata and analysis coverage separately from risk.

Logical sequence: explicit capture → immutable preview → explicit submission →
local service → LLM candidate JSON → schema/evidence/rule checks → score → report.

## Alibaba page-agent integration

Integrate Alibaba page-agent's DOM extraction components through a dedicated
read-only adapter. This is a deliberate use of the project's DOM machinery,
not a claim to run the full PageAgent autonomous interaction loop. The assignment
wording must be accepted on that basis as part of architecture approval.

The upstream PageController exposes getBrowserState/updateTree alongside actions
and an executeJavascript method containing eval. Its serializer also includes
interactive attributes and transforms text. Consequently neither its full action
surface nor its serialized output will be the quotation authority.

Recommended packaging: vendor only the necessary DOM extraction source and its
transitive dependencies from a pinned upstream commit, retaining MIT notices
and provenance under src/extension/vendor/page-agent-dom/. Adapt it to disable
overlays, action dispatch, arbitrary script evaluation, and form-value collection.
Use extracted node references to build our own lossless text snapshot. Document
all adaptations and package audits. No CDN scripts or demo LLM endpoint.

This requires a post-approval feasibility check before building the rest of the
extension: verify extraction on long noninteractive policy text, hidden content,
and MV3 CSP; inspect the resulting bundle for dynamic code evaluation and remote
code. If this integration cannot satisfy those constraints, return to the user
with a revised design rather than silently removing the required integration.

Chrome permissions proposed: activeTab, scripting, storage, and a host permission
restricted to the fixed loopback service origin. No all-sites permission,
debugger, browsing history, or external runtime messaging. Page-agent adds no
independent permission grant. Capture happens only following the action click.

## LLM contract and deterministic acceptance

Provide a configurable provider adapter with an operator-owned API key supplied
through an ignored environment file. The first adapter targets one documented
JSON-capable endpoint selected before live testing; provider/model selection is
left to the implementer within available credentials and budget. No dependency on
Alibaba's shared demo key. Changing provider must not change the report schema.

LLM output is candidate data, never report HTML or executable instructions. The
model sees a fixed task, enumerated categories, JSON schema, and separately
delimited untrusted source data. It has no tools, credentials, browser control,
URL fetching, or authority to change rules.

Candidate fields: category ID, an exact quotation, chunk ID, and an uncertainty
reason enum when applicable. The model cannot supply the final score, severity,
legal conclusion, or unrestricted explanation text. A versioned Turkish template
per category supplies the accepted title and explanation, reducing unsupported
details. Any category-specific qualification must come from validated evidence.

Initial categories: automatic renewal, trial conversion to paid subscription,
restricted refunds, cancellation restrictions, unilateral changes, third-party
data sharing, advertising/profiling use, extended retention, mandatory arbitration,
and class-action waiver. Templates describe what a clause warrants checking;
they do not determine legality or enforceability in any jurisdiction.

Acceptance proceeds in this order:

- Bound response size; parse one JSON object without prose/code-fence repair.
- Validate required fields, enums, lengths, and additionalProperties:false using
  a committed JSON Schema. Malformed/schema-invalid output rejects that chunk.
- Locate each quotation in the submitted chunk and immutable snapshot; only
  whitespace-equivalent matching is allowed, with a reversible mapping to exact
  original text. No fuzzy/semantic quote matching or fabricated punctuation.
- Require a complete, meaningful clause span, preserving nearby exceptions and
  negation. Reject ambiguous duplicate locations unless they can be resolved by
  chunk/span identity. Resolve authoritative offsets locally, not from the model.
- Apply category-specific conservative evidence checks, including explicit
  trigger wording and negative/conditional fixtures for Turkish and English.
  A matching quotation alone does not prove the model's interpretation. If the
  rule cannot establish the category, omit it from scored findings and count it
  as unsupported/uncertain. Rules and their limitations are versioned.
- Merge duplicate category/span findings from overlapping chunks, then assign
  fixed severity and Turkish templates from the versioned category rules.

Semantic understanding is imperfect. These checks reduce unsupported claims;
they do not establish legal truth. Evaluation must expose false positives and
misses, including ones introduced by conservative category rules.

## Coverage, runtime bounds, and scoring

Initial safety bounds, chosen for the prototype: 200,000 source characters,
20,000-character chunks with up to 1,000 characters of paragraph overlap,
at most 12 chunks, two concurrent provider calls, a 45-second call timeout,
and a three-minute analysis deadline. Split on paragraph boundaries where
possible. Token-budget checking may reduce a chunk for the chosen provider;
never silently truncate it. Oversized captures stop before transmission and
ask the user to select a smaller region. No automatic paid retries in version one.

Track source intervals successfully analyzed rather than summing overlapped
chunk lengths. Coverage means processed capture coverage, not a guarantee that
all contractual terms on the website were captured or understood.

Use states complete, partial, inconclusive, and error. A missing key, unreachable
service, empty capture, malformed response, provider refusal, or deadline never
becomes a zero-risk result. A chunk with rejected candidates makes the result
partial even if other findings survive. If no supported findings remain under
uncertainty, show inconclusive rather than a reassuring numeric score.

For accepted findings, category weights are: renewal 10, trial conversion 10,
refund restriction 10, cancellation restriction 15, unilateral change 10,
third-party sharing 10, advertising/profiling 10, retention 5, arbitration 10,
class-action waiver 10. Score is the sum of weights of distinct detected
categories, bounded 0–100. Overlap/duplicates do not increase the score.

These weights are a project rubric, not a legal or empirically calibrated
probability. Label the number “Tespit edilen risk göstergesi.” A partial result
with supported findings may show its observed score with an equally prominent
“Eksik analiz” label. Zero with complete processing means “Doğrulanmış risk
bulunamadı,” accompanied by the capture scope and a warning that clauses can be
missed. It must never say the contract is safe.

## Local service security and retention

Bind only to 127.0.0.1 on a fixed documented port. Require an operator-generated
pairing token entered in extension settings and kept in extension-only session
storage. Require JSON POST plus an Authorization header, enforce Host checks,
and allow only the configured chrome-extension origin via CORS. Local demo
origins are explicit development configuration, not wildcard production access.
Reject unauthenticated, mismatched-origin, oversized, and rate-exceeding requests.
Rate-limit provider calls and permit no arbitrary destination forwarding.

Use runtime message sender checks; no window.postMessage bridge from the web
page to privileged operations. Restrict extension session storage access to
trusted extension contexts. Store no provider key in the extension. Never log
keys, tokens, full source text, or raw model responses by default. Captures and
reports are session-only; a clear action deletes them. The service retains data
only for the active request and keeps no disk history.

Before submission, disclose that the captured text will reach the configured
LLM provider and is subject to its retention policy. No analytics. Export and
persistent history are deferred. A malicious page can still alter its displayed
text; snapshotting proves what was analyzed, not a site's historical authenticity.

## Prompt-injection and failure behavior

Test both excluded hidden instructions and visible instructions embedded in
apparently legitimate policy paragraphs. A suspicious instruction detector may
warn, but is not a security boundary and cannot promise detection of every attack.
The fixed no-tools analysis pipeline and deterministic checks enforce boundaries.

Security fixtures include requests to ignore the schema, output zero risk,
invent quotations, quote hidden text, reclassify unrelated clauses, send secrets
to an attacker URL, inject HTML, and execute page actions. Include a valid quote
paired with an unsupported category and a clause whose exception negates the
claimed risk. Assert that invalid candidates never render or affect the score,
hidden text never enters capture, and no unauthorized network/page action occurs.
Do not assert all prompt injections are solved if a model suppresses findings;
compare clean/attacked outputs and report that as a miss or security limitation.

## Verification, evaluation, and demo

Vitest covers evidence mapping, strict schemas, category counterexamples,
deduplication, score invariants, interval coverage, and service authorization.
Browser fixtures cover actual visibility/CSS behavior that DOM emulation cannot
reliably establish. Security fixtures include malformed JSON and quotation
mismatches. These checks are planned, not executed or passing today.

Cypress exercises the shared capture/analysis/report path through a localhost
demo host, with injected transport adapters and clearly marked fixture provider
responses for deterministic scenarios. This tests production modules but is not
proof of extension permissions, messaging, or installation.

Separately load the unpacked extension in Chrome for Testing or Chromium via
the browser launch API for integration checks, plus a documented real Chrome
manual smoke test of the action gesture, capture, report, service access, and
restricted-page errors. A Cypress Node/CDP bridge may invoke the extension
action for this integration run; any extra test permissions belong exclusively
to a test manifest. Do not claim that a Cypress visit controls browser toolbar UI.

Record the Cypress demo host flow in one scenario targeting 70–85 seconds,
showing an accepted clause and quotation, then an evidence mismatch or incomplete
capture producing uncertainty, with the disclaimer visible throughout. Clearly
label recorded fixture responses; demonstrate a separate real-key extension
smoke run and report its actual outcome. If the instructor requires the video
itself to operate the extension toolbar, revise the recording design explicitly.

Evaluation uses at least five real public policy documents from distinct services,
covering ToS, privacy, and subscription terms. Select exact pages and archive
permitted snapshots during implementation; record URL, retrieval date, effective
date when present, language, hash, and whether each is full text or an excerpt.
Include at least one Turkish and one English document.

Annotate category plus evidence span before examining model results, with
negative examples and explicit ambiguous/unsupported labels. Freeze annotations
and a reproducible matching protocol: a true positive needs the same category
and an accepted quotation overlapping the annotated clause; match one-to-one.
Unmatched accepted findings are false alarms; unmatched positive annotations
are misses. Manually review boundary/exception disputes. Report per-document
and aggregate TP/FP/FN, precision/recall, rejected candidates, capture/analysis
coverage, and representative failure explanations.

Use separate development/security fixtures for tuning; run the frozen five-policy
set without further tuning. Archive provider/model, rule and prompt versions,
configuration, timings, and bounded redacted outputs. A fixture replay tests the
pipeline; only real-provider runs count as the model evaluation. If credentials
are unavailable, mark live evaluation pending rather than manufacturing metrics.
This is a small human-annotated evaluation, not professional legal validation.

## Repository and command contract

Keep AGENTS.md unchanged. Follow its src/extension/, src/analysis/, tests/,
cypress/, eval/, and assets/ structure. Add src/server/ for the key-holding local
service, src/demo/ for the shared-module demo host, and docs/ for design decisions.
README documents trust boundaries, exact permissions, provider configuration,
source handling, score meaning, failure cases, page-agent provenance, and Chrome
unpacked-extension installation.

Proposed commands to define after approval: npm run dev, npm run build,
npm run server, npm run lint, npm run format:check, npm run typecheck,
npm run test:unit, npm run test:e2e, npm run demo:record, and npm run eval.
No package manifest exists today, so none is currently a working command.
README will distinguish fixture tests, extension integration, and live evaluation.

## Approval and remaining builder discretion

Approval is requested for the system boundary and local-service startup,
user-triggered capture, restricted page-agent DOM integration, category-based
score, deterministic Turkish explanations, and the stated testing/demo scope.

The implementer may choose compatible pinned versions, concrete internal types,
styling, the exact five source pages, and a configured affordable provider/model
without changing these boundaries. Missing credentials may require user input
before live analysis; they do not justify embedding credentials in source.

After explicit architecture approval, write a sequenced implementation plan.
Only then scaffold, install dependencies, write application/test code, and run
the feasibility check. No GitHub creation, push, or publication is authorized.

## Primary references checked during planning

- [Alibaba page-agent](https://github.com/alibaba/page-agent): DOM-oriented agent,
  bring-your-own LLM configuration, and experimental-only demo endpoint.
- [PageController source](https://github.com/alibaba/page-agent/blob/main/packages/page-controller/src/PageController.ts):
  query/action boundary and dynamic JavaScript execution capability.
- [DOM extraction source](https://github.com/alibaba/page-agent/blob/main/packages/page-controller/src/dom/index.ts):
  visibility metadata, interactive serialization, and overlay behavior.
- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab):
  user-invoked temporary tab access and scripting permission.
- [Cypress browser launch options](https://docs.cypress.io/app/references/launching-browsers):
  browser launch customization and Chrome for Testing/Chromium extension loading.
- [Ajv standalone validators](https://ajv.js.org/standalone.html): build-time
  generation avoids dynamic schema compilation in the extension.
