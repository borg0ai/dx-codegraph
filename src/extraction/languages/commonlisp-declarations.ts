import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { NodeKind } from '../../types';
import type { ExtractorContext } from '../tree-sitter-types';
import { commonLispForm, lispChildren, lispSymbolNode, lispText, type CommonLispForm } from './commonlisp-forms';
import { commonLispDesignator, commonLispExport, commonLispKey, commonLispPackageName, commonLispReference, parseCommonLispSymbol, printCommonLispName } from './commonlisp-symbols';

export interface CommonLispEnvironment {
  packageName: string;
  functions: Set<string>;
  macros: Set<string>;
}

const DECLARATIONS: Readonly<Record<string, NodeKind>> = {
  DEFUN: 'function', DEFGENERIC: 'function', DEFMETHOD: 'method', DEFMACRO: 'function',
  DEFCLASS: 'class', DEFSTRUCT: 'struct', DEFVAR: 'variable', DEFPARAMETER: 'variable', DEFCONSTANT: 'constant',
};

export function collectCommonLispFunctions(forms: readonly SyntaxNode[], env: CommonLispEnvironment, source: string): void {
  for (const child of forms) {
    const form = commonLispForm(child, source);
    if (!form) continue;
    if (form.operator === 'IN-PACKAGE') env.packageName = commonLispPackageName(commonLispDesignator(lispText(form.values[1] ?? child, source)) ?? env.packageName);
    const name = form.values[1];
    const symbol = name && parseCommonLispSymbol(lispText(name, source), env.packageName);
    if (symbol && ['DEFUN', 'DEFGENERIC'].includes(form.operator)) env.functions.add(commonLispKey(symbol));
    if (symbol && form.operator === 'DEFMACRO') env.macros.add(commonLispKey(symbol));
    if (form.operator === 'PROGN') collectCommonLispFunctions(form.values.slice(1), env, source);
    if (form.operator === 'EVAL-WHEN') collectCommonLispFunctions(form.values.slice(2), env, source);
  }
}

function packageDeclaration(form: CommonLispForm, ctx: ExtractorContext): void {
  const name = form.values[1];
  const writtenName = name && commonLispDesignator(lispText(name, ctx.source));
  if (!writtenName) return;
  const packageName = commonLispPackageName(writtenName);
  const exports: string[] = [];
  for (const option of form.values.slice(2)) {
    const values = lispChildren(option);
    if (lispText(values[0] ?? option, ctx.source).toUpperCase() !== ':EXPORT') continue;
    for (const value of values.slice(1)) {
      const exported = commonLispDesignator(lispText(value, ctx.source));
      if (exported) exports.push(commonLispExport(exported));
    }
  }
  ctx.createNode('namespace', packageName, form.syntax, {
    qualifiedName: printCommonLispName(packageName), decorators: exports,
    signature: lispText(form.syntax, ctx.source),
  });
}

function declarationName(form: CommonLispForm): SyntaxNode | undefined {
  const name = form.values[1];
  return form.operator === 'DEFSTRUCT' && name?.type === 'list_lit' ? lispChildren(name)[0] : name;
}

function classMembers(form: CommonLispForm, ctx: ExtractorContext, env: CommonLispEnvironment, id: string, qualifiedName: string): void {
  if (form.operator === 'DEFCLASS') {
    for (const parent of form.values[2]?.type === 'list_lit' ? lispChildren(form.values[2]) : []) {
      const symbol = lispSymbolNode(parent) && parseCommonLispSymbol(lispText(parent, ctx.source), env.packageName);
      if (symbol) ctx.addUnresolvedReference({ fromNodeId: id, referenceName: commonLispReference(symbol), referenceKind: 'extends', line: parent.startPosition.row + 1, column: parent.startPosition.column });
    }
  }
  const fields = form.operator === 'DEFCLASS' ? (form.values[3] ? lispChildren(form.values[3]) : []) : form.values.slice(2);
  for (const field of fields) {
    const name = field.type === 'list_lit' ? lispChildren(field)[0] : field;
    if (!lispSymbolNode(name)) continue;
    const symbol = parseCommonLispSymbol(lispText(name, ctx.source), env.packageName);
    if (symbol) ctx.createNode('field', lispText(name, ctx.source), field, { qualifiedName: `${qualifiedName}::${printCommonLispName(symbol.name)}` });
  }
}

export function extractCommonLispDeclaration(
  form: CommonLispForm, ctx: ExtractorContext, env: CommonLispEnvironment,
  walk: (node: SyntaxNode) => void, topLevel: boolean,
): boolean {
  if (form.operator === 'IN-PACKAGE') {
    if (topLevel && form.values[1]) env.packageName = commonLispPackageName(commonLispDesignator(lispText(form.values[1], ctx.source)) ?? env.packageName);
    return true;
  }
  if (form.operator === 'DEFPACKAGE') { packageDeclaration(form, ctx); return true; }
  const kind = DECLARATIONS[form.operator];
  if (!kind) return false;
  const name = declarationName(form);
  const symbol = lispSymbolNode(name) && parseCommonLispSymbol(lispText(name, ctx.source), env.packageName);
  if (!symbol) return true;
  const parameters = ['DEFUN', 'DEFGENERIC', 'DEFMETHOD', 'DEFMACRO'].includes(form.operator)
    ? form.values.find((value, index) => index >= 2 && value.type === 'list_lit') : undefined;
  const bodyStart = parameters ? form.values.indexOf(parameters) + 1 : 3;
  const body = form.values.slice(bodyStart);
  const methodIdentity = kind === 'method' ? `/${form.values.slice(2, bodyStart).map((value) => lispText(value, ctx.source)).join(' ').replace(/\s+/g, ' ')}` : '';
  const decorators = form.operator === 'DEFMACRO' ? ['commonlisp:macro'] : form.operator === 'DEFGENERIC' ? ['commonlisp:generic'] : [];
  const displayName = name.childForFieldName('symbol') ?? name;
  const created = ctx.createNode(kind, lispText(displayName, ctx.source), form.syntax, {
    qualifiedName: commonLispKey(symbol) + methodIdentity, decorators,
    signature: ctx.source.slice(form.syntax.startIndex, parameters?.endIndex ?? form.syntax.endIndex).slice(0, 500),
    docstring: body[0]?.type === 'str_lit' ? commonLispDesignator(lispText(body[0], ctx.source)) ?? undefined : undefined,
  });
  if (!created) return true;
  ctx.pushScope(created.id);
  if (kind === 'class' || kind === 'struct') classMembers(form, ctx, env, created.id, created.qualifiedName);
  else if (form.operator !== 'DEFGENERIC') {
    const evaluated = kind === 'variable' || kind === 'constant' ? form.values.slice(2, 3) : body;
    for (const value of evaluated) walk(value);
  }
  ctx.popScope();
  return true;
}
