# RFC 0001: Add Common Lisp language support

**Status:** Approved

## Summary

Add Common Lisp as a first-class indexed language in CodeGraph. Parse `.lisp`, `.lsp`, `.cl`, and ASDF `.asd` files with a vendored Tree-sitter grammar, then extract definitions and statically visible calls into the existing graph so search, node inspection, and flow exploration work through current APIs.

## Problem

CodeGraph currently has no Common Lisp grammar or extractor, so Common Lisp projects are skipped by language detection and cannot participate in structural queries. Common Lisp's code-as-data syntax and macro-heavy definitions require a language-specific extraction layer; treating every list as a call or relying on generic identifier matching would produce misleading edges.

## Goals

- Detect Common Lisp source and ASDF system files using their established extensions.
- Extract named functions, generic functions, methods, macros, classes, structures, packages, and top-level variables/constants where the grammar exposes them reliably.
- Resolve statically named calls, including qualified symbols, into existing `calls` and `references` graph edges without inventing runtime macro expansion.
- Make extracted source available through existing search, node, and explore surfaces.
- Bundle the grammar in distributed builds using the existing grammar asset pipeline.

## Non-goals

- Evaluating Lisp forms, loading systems, macro expansion, or invoking a Lisp runtime.
- Inferring runtime dispatch, computed function names, reader-eval, or package imports that cannot be determined statically.
- Emacs Lisp, Clojure, Scheme, and other Lisp dialects.
- Framework-specific or ASDF dependency-resolution edges.

## Design

Vendor a pinned, license-reviewed Tree-sitter Common Lisp grammar and WASM artifact, following the repository's existing grammar provenance and ABI checks. Register `commonlisp` in language and file-extension detection, grammar loading, and supported-language reporting. Add a language configuration/extractor that maps the grammar's definition forms to existing `NodeKind` values and extracts statically visible symbol calls; preserve package qualification in names while matching case-insensitively where Common Lisp symbol rules require it. Do not expand macros or claim a call edge when the form cannot be recognized as a call.

Add fixtures and tests covering `defun`, `defgeneric`, `defmethod`, `defmacro`, `defclass`, `defstruct`, `defpackage`/`in-package`, variables, qualified symbols, nested calls, comments, strings, and malformed/reader syntax. Update language-support documentation and grammar asset checks. Validate extraction and graph flows on a real small/medium/large Common Lisp repository using the repository's language support quality loop; record unsupported grammar forms and do not claim coverage where results are incomplete.

## Acceptance

- `.lisp`, `.lsp`, `.cl`, and `.asd` files are detected and indexed; unrelated file types remain unaffected.
- Representative definitions produce correct node kinds, names, qualified names, source ranges, and bodies.
- Statically visible calls produce correct edges; strings, comments, quoted data, and unrecognized macro forms do not produce false call edges.
- Search, `codegraph_node`, and `codegraph_explore` return sufficient Common Lisp source/flow results on fixtures and a real project.
- Grammar WASM is present in build output and release archive checks; grammar license and pinned provenance are documented.
- Existing language extraction tests and full suite pass; real-repository evaluation meets the language support quality loop's flow/read-displacement bar without control-repo regression.
