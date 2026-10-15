import domTree from './vendor/page-agent-dom/dom-tree.js';
import { makeSnapshot } from '../analysis/snapshot';

function visible(element: Element): boolean {
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      current.matches(
        'script,style,noscript,template,input,textarea,select,[hidden],[inert],[aria-hidden="true"],[contenteditable]:not([contenteditable="false"]),[data-tos-ui]',
      )
    )
      return false;
    const style = getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility !== 'visible' ||
      Number(style.opacity) === 0 ||
      style.contentVisibility === 'hidden'
    )
      return false;
    if (
      style.clipPath === 'inset(50%)' ||
      style.clip === 'rect(0px, 0px, 0px, 0px)'
    )
      return false;
  }
  return true;
}

export async function capturePage() {
  // Upstream extraction really runs. Raw node references, not its transformed
  // interactive serialization, are the quotation authority.
  const tree = domTree({
    doHighlightElements: false,
    focusHighlightIndex: -1,
    viewportExpansion: -1,
    debugMode: false,
    interactiveBlacklist: [],
    interactiveWhitelist: [],
    highlightOpacity: 0,
    highlightLabelOpacity: 0,
  });
  const selection = getSelection();
  const range =
    selection && !selection.isCollapsed && selection.rangeCount
      ? selection.getRangeAt(0)
      : null;
  const region = range
    ? 'selection'
    : document.querySelector('main,article')
      ? 'main'
      : 'body';
  const root = range
    ? document.body
    : (document.querySelector('main,article') ?? document.body);
  const accepted = new Set(
    Object.values(tree.map)
      .filter((node) => node.type === 'TEXT_NODE' && node.ref && node.isVisible)
      .map((node) => node.ref),
  );
  const paragraphs: { block: Element; text: string }[] = [];
  function append(parent: Element, value: string, collapsible: boolean) {
    let block = parent;
    while (
      block.parentElement &&
      ['inline', 'contents'].includes(getComputedStyle(block).display)
    )
      block = block.parentElement;
    let current = paragraphs.at(-1);
    if (!current || current.block !== block) {
      if (!value.trim()) return;
      current = { block, text: '' };
      paragraphs.push(current);
    }
    if (collapsible && current.text.endsWith(' ') && value.startsWith(' '))
      value = value.slice(1);
    current.text += value;
  }
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && !visible(node as Element))
          return NodeFilter.FILTER_REJECT;
        if (node.nodeType === Node.TEXT_NODE && !accepted.has(node))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (range && !range.intersectsNode(node)) continue;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName === 'BR' && node.parentElement)
        append(node.parentElement, '\n', false);
      continue;
    }
    const ref = node as Text;
    const parent = ref.parentElement;
    if (!parent || !visible(parent)) continue;
    let value = ref.data;
    if (range?.startContainer === ref) value = value.slice(range.startOffset);
    if (range?.endContainer === ref)
      value = value.slice(
        0,
        range.endOffset -
          (range.startContainer === ref ? range.startOffset : 0),
      );
    const whiteSpace = getComputedStyle(parent).whiteSpace;
    const collapsible = ['normal', 'nowrap'].includes(whiteSpace);
    // HTML formatting whitespace is rendered as spaces, not paragraph breaks.
    value = collapsible
      ? value.replace(/[\t\n\r\f ]+/g, ' ')
      : value.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n');
    append(parent, value, collapsible);
  }
  // Only DOM block transitions establish complete-paragraph evidence boundaries.
  const text = paragraphs
    .map((paragraph) => paragraph.text.trim().replace(/\n{2,}/g, '\n'))
    .filter(Boolean)
    .join('\n\n');
  const warnings = ['renderedHtmlOnly', 'linkedDocumentsNotCaptured'];
  if (region === 'body') warnings.push('bodyFallback');
  if (document.querySelector('iframe')) warnings.push('framesExcluded');
  return makeSnapshot(
    text.trim(),
    location.href,
    document.title,
    region,
    warnings,
  );
}

void capturePage().then(
  (snapshot) => chrome.runtime.sendMessage({ type: 'captureReady', snapshot }),
  () => chrome.runtime.sendMessage({ type: 'captureFailed' }),
);
