import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { ExtractorContext, LanguageExtractor } from '../tree-sitter-types';
import { collectCommonLispFunctions, extractCommonLispDeclaration, type CommonLispEnvironment } from './commonlisp-declarations';
import { evaluatedCommonLispChildren } from './commonlisp-evaluation';
import { commonLispForm, lispChildren, lispSymbolNode, lispText } from './commonlisp-forms';
import { commonLispKey, commonLispReference, parseCommonLispSymbol } from './commonlisp-symbols';

/*
 * Bundled tree-sitter-commonlisp.wasm notices.
 * Copyright (c) 2021 Stephan Seitz
 * Copyright (c) 2025 Leandro Pereira
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

function extractCommonLisp(root: SyntaxNode, ctx: ExtractorContext): void {
  const declarations: CommonLispEnvironment = { packageName: 'CL-USER', functions: new Set(), macros: new Set() };
  collectCommonLispFunctions(lispChildren(root), declarations, ctx.source);
  const env: CommonLispEnvironment = {
    packageName: 'CL-USER', functions: declarations.functions, macros: declarations.macros,
  };
  const walk = (node: SyntaxNode, topLevel = false): void => {
    const form = commonLispForm(node, ctx.source);
    if (!form) return;
    if (extractCommonLispDeclaration(form, ctx, env, (child) => walk(child), topLevel)) return;
    const head = form.values[0];
    const symbol = lispSymbolNode(head) && parseCommonLispSymbol(lispText(head, ctx.source), env.packageName);
    const key = symbol ? commonLispKey(symbol) : '';
    const localOperator = env.functions.has(key) || env.macros.has(key);
    const evaluated = localOperator ? null : evaluatedCommonLispChildren(form);
    if (evaluated !== null) {
      const preservesTopLevel = topLevel && (form.operator === 'PROGN' || form.operator === 'EVAL-WHEN');
      for (const child of evaluated) walk(child, preservesTopLevel);
      return;
    }
    const caller = ctx.nodeStack[ctx.nodeStack.length - 1];
    if (!symbol || !caller) return;
    ctx.addUnresolvedReference({
      fromNodeId: caller, referenceName: commonLispReference(symbol), referenceKind: 'calls',
      line: head.startPosition.row + 1, column: head.startPosition.column,
    });
    // 未知运算符可能是宏，其参数可能是数据，不能当成可执行形式递归。
    if (env.functions.has(key) && !env.macros.has(key)) {
      for (const child of form.values.slice(1)) walk(child);
    }
  };
  for (const form of lispChildren(root)) walk(form, true);
}

export const commonlispExtractor: LanguageExtractor = {
  functionTypes: [], classTypes: [], methodTypes: [], interfaceTypes: [], structTypes: [],
  enumTypes: [], typeAliasTypes: [], importTypes: [], callTypes: [], variableTypes: [],
  nameField: '', bodyField: '', paramsField: '',
  visitNode: (node, ctx) => {
    if (node.type !== 'source') return false;
    extractCommonLisp(node, ctx);
    return true;
  },
};
