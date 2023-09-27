#!/bin/bash
cd "${0%/*}"
CODY_AGENT_TRACE_PATH=/tmp/cody.log pnpm exec node --inspect-brk dist/index.js

