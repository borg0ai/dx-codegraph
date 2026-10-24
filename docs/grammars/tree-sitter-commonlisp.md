# Common Lisp grammar

CodeGraph vendors `src/extraction/wasm/tree-sitter-commonlisp.wasm` from [`@lumis-sh/wasm-commonlisp@0.26.2`](https://www.npmjs.com/package/@lumis-sh/wasm-commonlisp/v/0.26.2). The artifact requires no runtime package dependency.

| Property | Value |
| --- | --- |
| Source | [tree-sitter-grammars/tree-sitter-commonlisp](https://github.com/tree-sitter-grammars/tree-sitter-commonlisp) |
| Upstream revision | `9db594efb43574c5fe4a1f880568b1f0d0ee6057` |
| Grammar version | `0.4.1` |
| Artifact URL | `https://registry.npmjs.org/@lumis-sh/wasm-commonlisp/-/wasm-commonlisp-0.26.2.tgz` |
| Build command and tool | `tree-sitter build --wasm`, tree-sitter CLI `0.26.11` |
| ABI | `15` |
| SHA-256 | `e57afb8f91fd323606ab8f1cb2200fe515d2764f4327bd196c18943e5b7c1c91` |
| License | MIT, copyright Stephan Seitz (2021) and distribution package copyright Leandro Pereira (2025) |

The complete MIT notices are retained in the Common Lisp extractor source and emitted JavaScript, so the notices accompany distributed `dist` builds.

The grammar health check uses the same runtime flags and companion grammars as indexing.

```sh
node scripts/add-lang/check-grammar.mjs src/extraction/wasm/tree-sitter-commonlisp.wasm __tests__/fixtures/commonlisp/grammar.lisp 20
```

The pinned artifact passed this check under Node `24.14.1` and web-tree-sitter `0.25.3`. All 20 repeated parses completed without parse errors or tree divergence.

## Coverage limits

The upstream grammar is a work in progress. Its README identifies incomplete number-literal coverage and gives special AST representations only to lowercase definition forms. CodeGraph adapts both those representations and uppercase generic lists.

CodeGraph extracts functions, generic declarations, methods, macros, classes, structures, package declarations, and top-level variable or constant forms. It resolves direct calls by exact package and symbol identity. Single-colon qualified calls require an indexed package export.

Quoted and backquoted forms remain data. Arguments of unknown operators remain opaque because the operator may be a macro. Nested calls beneath such arguments are omitted. Local `flet`, `labels`, and `macrolet` bodies, reader conditionals, package nicknames and imports, runtime method dispatch, and macro expansion remain unsupported.

Malformed source can cause the grammar to consume later forms inside an `ERROR` node without recoverable children. CodeGraph keeps valid definitions parsed before the error and does not invent structure for the consumed suffix.
