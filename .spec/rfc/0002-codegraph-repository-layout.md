# RFC 0002: Reorganize CodeGraph repository layout

**Status:** Draft

## Summary

Move independently shipped applications and the native Rust crate into `apps/` and `crates/`, while keeping the root npm package and its `src/` tree in place. Keep existing package names, commands, build outputs, deployment behavior, and npm publication contents stable.

## Problem

The repository has four executable products and one Rust crate at its root beside the published npm package. Their manifests, deployment configs, build scripts, and docs assume those root paths. This makes the repository harder to navigate and blocks a clear boundary between the published package, applications, and native crate.

## Goals

- Move `site/` to `apps/site/`.
- Move `ui/` to `apps/viewer/` and keep it as the root npm workspace package.
- Move `telemetry-dashboard/` and `telemetry-worker/` under `apps/`.
- Move `codegraph-kernel/` to `crates/codegraph-kernel/` and keep Cargo as its native workspace manager.
- Update every active build, test, release, deploy, package, and documentation reference to the new paths.
- Preserve the root npm package name, version, entry points, CLI command, package contents, user commands, and generated output paths.

## Non-goals

- Moving the root npm package or `src/` into a new package.
- Changing npm package names, public APIs, CLI behavior, or release process.
- Converting npm workspaces to pnpm or adding Turborepo.
- Combining npm and Cargo into one workspace manager.
- Changing deployment providers, domains, application behavior, or telemetry data.

## Design

Use this layout:

```text
apps/
  site/
  viewer/
  telemetry-dashboard/
  telemetry-worker/
crates/
  codegraph-kernel/
src/
__tests__/
package.json
```

Keep the root npm package as the distribution boundary. Update its workspace entry from `ui` to `apps/viewer`. Update root scripts and helper scripts that locate viewer files, including `build:ui`, `build:lib`, version sync, package checks, bundle packaging, and generated output checks. Keep `dist/viewer/` and `ui/dist` semantics only where those paths describe published output; update the viewer workspace's package metadata directory to `apps/viewer`.

Update GitHub workflows, Rust build scripts, release artifact paths, deployment path filters, Wrangler configuration, README links, active design docs, and tests that refer to moved source directories. Preserve `dist/`, npm tarball contents, release archive layout, deployed routes, and package-relative runtime paths. Keep root commands unchanged. Do not add wrapper scripts solely to preserve old directory paths.

Use native managers at each boundary: npm continues to manage the root package and viewer workspace, and Cargo continues to manage `crates/codegraph-kernel`. Do not introduce a root Cargo workspace unless an existing Cargo command requires it.

## Acceptance

- All five directories exist at their target paths, and old source directories are absent.
- Root npm installation, build, viewer library build, tests, and package checks resolve the new viewer path.
- Kernel build, parity checks, and release artifact staging resolve the new crate path.
- Site deployment and both telemetry applications retain their current build, check, and deploy commands.
- Searches find no stale operational references to the old paths. Historical prose may retain old paths only when it clearly describes the prior layout.
- The npm tarball contents, CLI entry point, generated viewer path, release archive layout, and deployment path filters remain unchanged in behavior.
- `npm test`, `npm run build`, `npm run build:lib`, and available crate/application checks pass.
