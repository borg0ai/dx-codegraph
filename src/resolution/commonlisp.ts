import { commonLispExport, commonLispKey, parseCommonLispSymbol, printCommonLispName } from '../extraction/languages/commonlisp-symbols';
import type { ResolvedRef, ResolutionContext, UnresolvedRef } from './types';

export function resolveCommonLispReference(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null {
  const symbol = parseCommonLispSymbol(ref.referenceName, 'CL-USER');
  if (!symbol) return null;
  if (symbol.external) {
    const exported = context.getNodesByQualifiedName(printCommonLispName(symbol.packageName)).some((node) =>
      node.language === 'commonlisp' && node.kind === 'namespace' && node.decorators?.includes(commonLispExport(symbol.name)));
    if (!exported) return null;
  }
  const candidates = context.getNodesByQualifiedName(commonLispKey(symbol)).filter((node) => {
    if (node.language !== 'commonlisp') return false;
    if (ref.referenceKind === 'extends') return node.kind === 'class' || node.kind === 'struct';
    return node.kind === 'function';
  });
  if (candidates.length !== 1) return null;
  const target = candidates[0]!;
  return {
    original: ref, targetNodeId: target.id, confidence: 0.95, resolvedBy: 'qualified-name',
    edgeKind: target.decorators?.includes('commonlisp:macro') ? 'references' : undefined,
  };
}
