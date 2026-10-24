import type { Node as SyntaxNode } from 'web-tree-sitter';
import { parseCommonLispSymbol } from './commonlisp-symbols';

export interface CommonLispForm {
  syntax: SyntaxNode;
  operator: string;
  values: SyntaxNode[];
}

export function lispText(node: SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

export function lispChildren(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter((child) => child.type !== 'comment' && child.type !== 'block_comment');
}

export function commonLispForm(node: SyntaxNode, source: string): CommonLispForm | null {
  if (node.type !== 'list_lit' || node.hasError) return null;
  let values = lispChildren(node);
  const specialized = values.length === 1 && values[0]?.type === 'defun' ? values[0] : null;
  if (specialized) {
    const children = lispChildren(specialized);
    const header = children.find((child) => child.type === 'defun_header');
    if (!header) return null;
    values = [...lispChildren(header), ...children.filter((child) => child !== header)];
  }
  const head = values[0];
  if (!head) return null;
  const symbol = parseCommonLispSymbol(lispText(head, source), 'COMMON-LISP');
  const standard = symbol && (symbol.packageName === 'COMMON-LISP' || symbol.packageName === 'CL');
  return { syntax: node, operator: standard ? symbol.name : '', values };
}

export function lispSymbolNode(node: SyntaxNode | undefined): node is SyntaxNode {
  return !!node && (node.type === 'sym_lit' || node.type === 'package_lit');
}
