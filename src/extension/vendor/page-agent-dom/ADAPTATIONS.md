# Read-only Alibaba DOM extraction

See provenance.json for the exact upstream v1.12.4 commit and original hashes.
The extraction file is MIT licensed; upstream also credits browser-use (MIT).

Local changes: text nodes retain their live DOM reference and whitespace-only
nodes (needed between adjacent inline elements); attribute enumeration
is disabled; inputs, selects, textareas, editable regions, frames, hidden and
inert subtrees are rejected before reading. Highlighting is always disabled by
our adapter. The full PageController, LLM client, actions, JavaScript execution,
and demo endpoint are not imported. No remote code is loaded at runtime.

The adapter adds ancestor visibility filtering, document-order extraction,
DOM block paragraph separators, BR line breaks and selection boundaries. It
normalizes CSS-collapsible whitespace as rendered; HTML source formatting cannot
invent evidence paragraph boundaries. It uses original text nodes rather than
upstream's trimmed interactive serialization for quotation evidence.
This is a read-only integration of the real DOM extraction component, not the
autonomous PageAgent interaction loop. It cannot establish legal correctness.
