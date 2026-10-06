# Compiled API and worker runtime

The original TypeScript compile succeeded but Node could not boot its output:
workspace exports pointed to source TypeScript with extensionless imports. Actual
failure evidence: evidence/q08-compiled-api-initial.log.

Each runtime package now emits its own JavaScript under `dist`, preserving package
location and its dependency resolution. The runtime builder parses import/export
and literal dynamic-import declarations with the pinned TypeScript compiler, adds
resolved JavaScript extensions and maps workspace exports to their emitted package
files. Missing emitted modules fail the build. Development/types keep source
exports; production Node loads emitted files directly. API/worker entrypoints and
shared packages retain their original external package dependency directories.
Root builds run one workspace at a time to make prerequisites explicit.

Actual complete builds, compiled API boot/readiness, visitor/CSRF/private-access
probes and compiled worker metrics pass. Empty SESSION_KEY fails compiled boot.
These checks establish runtime packaging correction, not HTTPS deployment or image
clearance: Docker production packaging, TLS/port/resource checks and vulnerability
remediation remain Q08. Never start a supposedly compiled production app with tsx
or claim tsc success alone proves native Node boot.
