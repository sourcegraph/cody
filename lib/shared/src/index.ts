// Add anything else here that needs to be used outside of this repository.

export { ChatModelProvider } from './chat-models'
export type { ChatContextStatus } from './chat/context'
export { renderCodyMarkdown } from './chat/markdown'
export type { ChatButton, ChatError, ChatMessage } from './chat/transcript/messages'
export type { ContextFile, PreciseContext } from './codebase-context/messages'
export type { CodyCommand } from './commands'
export { basename, dedupeWith, isDefined, pluralize, isErrorLike } from './common'
export { isWindows } from './common/platform'
export type { ActiveTextEditorSelectionRange } from './editor'
// TODO: figure out why the symbols from displayPath.ts can't be imported from
// `@sourcegraph/cody-shared`. To reproduce the problem, tweak the user query in
// one of the tests in agent/src/index.test.ts, run `pnpm update-agent-recordings`
// and look for the error message "no environment info for displayPath function
// (call setDisplayPathEnvInfo; see displayPath docstring for more info)". The
// error is not reproducible when running in replay mode.
// export { displayPath, setDisplayPathEnvInfo } from './editor/displayPath'
export { hydrateAfterPostMessage } from './editor/hydrateAfterPostMessage'
export type { Attribution, Guardrails } from './guardrails'
export { ContextWindowLimitError, RateLimitError } from './sourcegraph-api/errors'
export { testFileUri } from './test/path-helpers'
