import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeGraph } from '../src';
import { extractFromSource } from '../src/extraction';
import { detectLanguage, getSupportedLanguages, initGrammars, isSourceFile, loadGrammarsForLanguages } from '../src/extraction/grammars';
import { resolveNamedSymbolFlow } from '../src/graph/named-symbol-flow';
import { ToolHandler } from '../src/mcp/tools';

beforeAll(async () => {
  await initGrammars();
  await loadGrammarsForLanguages(['commonlisp']);
});

describe('Common Lisp extraction', () => {
  it.each(['lisp', 'lsp', 'cl', 'asd'])('detects .%s source files', (extension) => {
    expect(detectLanguage(`src/example.${extension}`)).toBe('commonlisp');
    expect(isSourceFile(`src/example.${extension}`)).toBe(true);
    expect(getSupportedLanguages()).toContain('commonlisp');
  });

  it('extracts definition forms, source ranges, packages, fields, and escaped case', () => {
    const result = extractFromSource('example.lisp', `(defpackage #:app (:export #:run))
(in-package :app)
(defun run (x) "Runs it." (helper x))
(DEFUN helper (x) x)
(defgeneric render (x))
(defmethod render :around ((x record)) (run x))
(defmacro with-record (x) x)
(defclass record () ((value :initarg :value)))
(defstruct settings timeout)
(defparameter *settings* nil)
(defvar *value* 1)
(defconstant +limit+ 10)
(defun |Mixed| () nil)`, 'commonlisp');
    const nodes = result.nodes;
    expect(nodes.find((node) => node.name === 'run')).toMatchObject({ kind: 'function', qualifiedName: 'APP::RUN', startLine: 3, endLine: 3, docstring: 'Runs it.' });
    expect(nodes.find((node) => node.name === 'helper')?.qualifiedName).toBe('APP::HELPER');
    expect(nodes.find((node) => node.name === 'render' && node.kind === 'function')?.decorators).toContain('commonlisp:generic');
    expect(nodes.find((node) => node.name === 'render' && node.kind === 'method')?.signature).toContain(':around');
    expect(nodes.find((node) => node.name === 'with-record')?.decorators).toContain('commonlisp:macro');
    expect(nodes.find((node) => node.name === 'record')?.kind).toBe('class');
    expect(nodes.find((node) => node.name === 'settings')?.kind).toBe('struct');
    expect(nodes.filter((node) => node.kind === 'field').map((node) => node.name)).toEqual(['value', 'timeout']);
    expect(nodes.find((node) => node.name === '+limit+')?.kind).toBe('constant');
    expect(nodes.find((node) => node.name === '|Mixed|')?.qualifiedName).toBe('APP::|Mixed|');
  });

  it('walks known evaluation positions and leaves data and unknown arguments opaque', () => {
    const source = `(defun target () nil)
(defun pass (x) x)
(defun run ()
  (let ((x (target)))
    (if x (pass (target)) nil)
    '(target)
    \`(target)
    (quote (target))
    (unknown-macro (target))
    "(target)"))
; (target)
#| (target) |#`;
    const result = extractFromSource('safe.lisp', source, 'commonlisp');
    const calls = result.unresolvedReferences.filter((ref) => ref.referenceKind === 'calls');
    expect(calls.map((ref) => [ref.referenceName, ref.line])).toEqual([
      ['CL-USER::TARGET', 4], ['CL-USER::PASS', 5], ['CL-USER::TARGET', 5], ['CL-USER::UNKNOWN-MACRO', 9],
    ]);
    expect(result.nodes.filter((node) => node.kind === 'function')).toHaveLength(3);
  });

  it('keeps file package state isolated and retains definitions before malformed input', () => {
    extractFromSource('one.lisp', '(in-package :first) (defun a () nil)', 'commonlisp');
    const second = extractFromSource('two.lisp', '(defun b () nil)\n(defun c () nil)\n)', 'commonlisp');
    expect(second.nodes.find((node) => node.name === 'b')?.qualifiedName).toBe('CL-USER::B');
    expect(second.nodes.find((node) => node.name === 'c')?.qualifiedName).toBe('CL-USER::C');
  });

  it('leaves arguments opaque when a file declares its own macro with a standard form name', () => {
    const result = extractFromSource('shadow.lisp', '(in-package :app) (defmacro when (data) data) (defun target () nil) (defun run () (when (target)))', 'commonlisp');
    expect(result.unresolvedReferences.map((ref) => ref.referenceName)).toEqual(['APP::WHEN']);
  });
});

describe('Common Lisp exact graph resolution', () => {
  let dir: string | undefined;
  let graph: CodeGraph | undefined;
  afterEach(() => {
    graph?.close();
    graph = undefined;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function index(files: Record<string, string>): Promise<CodeGraph> {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-commonlisp-'));
    for (const [file, source] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), source);
    graph = CodeGraph.initSync(dir);
    await graph.indexAll();
    return graph;
  }

  it('resolves exact same-package and exported qualified calls across files', async () => {
    const cg = await index({
      'package.lisp': '(defpackage #:app (:export #:public))',
      'target.lisp': '(in-package :app) (defun public () nil) (defun private () nil)',
      'caller.lisp': '(in-package :app) (defun local () (public))\n(in-package :other) (defun run () (app:public) (app:private) (app::private))',
    });
    const functions = cg.getNodesByKind('function');
    const outgoing = (name: string) => cg.getOutgoingEdges(functions.find((node) => node.name === name)!.id).filter((edge) => edge.kind === 'calls');
    const publicId = functions.find((node) => node.name === 'public')!.id;
    const privateId = functions.find((node) => node.name === 'private')!.id;
    expect(outgoing('local').map((edge) => edge.target)).toEqual([publicId]);
    expect(outgoing('run').map((edge) => edge.target).sort()).toEqual([publicId, privateId].sort());
  });

  it('refuses ambiguity and cross-package guessing, and represents macro uses as references', async () => {
    const cg = await index({
      'a.lisp': '(in-package :app) (defun duplicate () nil) (defmacro syntax (x) x) (defgeneric render (x)) (defmethod render ((x integer)) nil)',
      'b.lisp': '(in-package :app) (defun duplicate () nil)',
      'c.lisp': '(in-package :other) (defun missing () nil)\n(in-package :app) (defun run () (duplicate) (missing) (syntax (duplicate)) (render 1))',
    });
    const functions = cg.getNodesByKind('function');
    const run = functions.find((node) => node.name === 'run')!;
    const edges = cg.getOutgoingEdges(run.id);
    expect(edges.filter((edge) => edge.kind === 'calls').map((edge) => edge.target)).toEqual([functions.find((node) => node.name === 'render')!.id]);
    expect(edges.find((edge) => edge.target === functions.find((node) => node.name === 'syntax')!.id)?.kind).toBe('references');
  });

  it('preserves escaped symbol case instead of falling back to names in another namespace', async () => {
    const cg = await index({
      'names.lisp': '(in-package :app) (defun |Mixed| () nil) (defun |mixed| () nil) (defun mixed () nil)',
      'run.lisp': '(in-package :app) (defun run () (|Mixed|) (MIXED))',
      'decoy.ts': 'export function Mixed() {}',
    });
    const functions = cg.getNodesByKind('function');
    const run = functions.find((node) => node.name === 'run')!;
    const targets = cg.getOutgoingEdges(run.id).filter((edge) => edge.kind === 'calls').map((edge) => edge.target).sort();
    expect(targets).toEqual(functions.filter((node) => node.qualifiedName === 'APP::|Mixed|' || node.qualifiedName === 'APP::MIXED').map((node) => node.id).sort());
  });

  it('explores call paths between hyphenated Common Lisp symbols', async () => {
    const cg = await index({
      'flow.lisp': `(defpackage #:app (:export #:handle-request #:normalize-path #:match-route))
(in-package :app)
(defun handle-request (path) (normalize-path path))
(defun normalize-path (path) (match-route path))
(defun match-route (path) path)`,
    });
    const query = 'handle-request normalize-path match-route';
    const flow = resolveNamedSymbolFlow(cg, query);
    expect(flow.chains[0]?.steps.map((step) => step.node.name)).toEqual([
      'handle-request', 'normalize-path', 'match-route',
    ]);

    const result = await new ToolHandler(cg).execute('codegraph_explore', { query });
    expect(result.content[0]?.text).toContain('**Flow (call path among the symbols you queried)**');
    expect(result.content[0]?.text).toContain('1. handle-request');
    expect(result.content[0]?.text).toContain('2. normalize-path');
    expect(result.content[0]?.text).toContain('3. match-route');
  });
});
