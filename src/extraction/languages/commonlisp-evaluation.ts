import type { Node as SyntaxNode } from 'web-tree-sitter';
import { lispChildren, type CommonLispForm } from './commonlisp-forms';

const EVALUATED = new Set(['PROGN', 'IF', 'WHEN', 'UNLESS', 'AND', 'OR', 'PROG1', 'PROG2', 'MULTIPLE-VALUE-PROG1', 'UNWIND-PROTECT', 'CATCH', 'THROW', 'LOCALLY']);
const SKIP_FIRST = new Set(['BLOCK', 'RETURN-FROM', 'THE', 'EVAL-WHEN', 'LAMBDA']);
const OPAQUE = new Set(['QUOTE', 'FUNCTION', 'DECLARE', 'DECLAIM', 'PROCLAIM', 'LOOP', 'MACROLET', 'SYMBOL-MACROLET', 'FLET', 'LABELS']);

export function evaluatedCommonLispChildren(form: CommonLispForm): SyntaxNode[] | null {
  const args = form.values.slice(1);
  if (OPAQUE.has(form.operator)) return [];
  if (EVALUATED.has(form.operator)) return args;
  if (SKIP_FIRST.has(form.operator)) return args.slice(1);
  if (form.operator === 'LET' || form.operator === 'LET*') {
    const initializers = args[0]?.type === 'list_lit'
      ? lispChildren(args[0]).flatMap((binding) => binding.type === 'list_lit' ? lispChildren(binding).slice(1, 2) : []) : [];
    return [...initializers, ...args.slice(1)];
  }
  if (form.operator === 'SETQ' || form.operator === 'SETF' || form.operator === 'PSETQ' || form.operator === 'PSETF') return args.filter((_, index) => index % 2 === 1);
  if (form.operator === 'COND') return args.flatMap((clause) => clause.type === 'list_lit' ? lispChildren(clause) : []);
  if (['CASE', 'ECASE', 'CCASE', 'TYPECASE', 'ETYPECASE', 'CTYPECASE'].includes(form.operator)) {
    return [...args.slice(0, 1), ...args.slice(1).flatMap((clause) => clause.type === 'list_lit' ? lispChildren(clause).slice(1) : [])];
  }
  if (form.operator === 'DOLIST' || form.operator === 'DOTIMES') {
    return [...(args[0]?.type === 'list_lit' ? lispChildren(args[0]).slice(1) : []), ...args.slice(1)];
  }
  return null;
}
