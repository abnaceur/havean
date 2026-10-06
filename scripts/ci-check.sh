#!/bin/sh
set -eu
mkdir -p evidence/ci
# A real intentionally wrong workflow assertion exercises the same business-test gate.
negative=tests/unit/ci-negative.test.ts
cleanup() { rm -f "$negative"; node scripts/sanitize-ci.mjs; pnpm exec tsx scripts/publish-ci-report.ts; }
trap cleanup EXIT HUP INT TERM
if [ "${HAVEN_CI_NEGATIVE:-0}" = 1 ]; then
  cat > "$negative" <<'TEST'
import {expect,it} from 'vitest';
import {transition,listingTransitions} from '../../packages/contracts/src/domain';
it('intentional business assertion must block CI',()=>{expect(transition(listingTransitions,'draft','submitted')).toBe('published');});
TEST
fi
check() {
  name=$1
  shift
  if "$@" > "evidence/ci/$name.log" 2>&1; then
    echo "$name passed"
  else
    echo "$name failed; see retained sanitized evidence/ci/$name.log"
    return 1
  fi
}
check install pnpm install --frozen-lockfile
check tasks pnpm task:validate
check fixtures pnpm fixtures:check
check contracts pnpm contracts:check
check reference node scripts/reference-validation.mjs
check licenses pnpm license:check
check lint pnpm lint
check types pnpm typecheck
check unit pnpm test:unit
# Capture the untouched seed before integration/browser mutation journeys.
# A pending visual review still fails CI, while independent backend gates run.
visual_status=0
if ! check visual pnpm test:visual; then visual_status=1; fi
check integration pnpm test:integration
check browser pnpm exec playwright test --project=desktop --project=mobile
check build env NODE_ENV=production NEXT_DIST_DIR=.next-ci pnpm build
exit "$visual_status"
