interface TreeNode {
  type: string;
  ref?: Node;
  isVisible?: boolean;
  text?: string;
}
export default function domTree(args: {
  doHighlightElements: boolean;
  focusHighlightIndex: number;
  viewportExpansion: number;
  debugMode: boolean;
  interactiveBlacklist: Element[];
  interactiveWhitelist: Element[];
  highlightOpacity: number;
  highlightLabelOpacity: number;
}): { rootId: string; map: Record<string, TreeNode> };
