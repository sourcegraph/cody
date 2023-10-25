/**
 * Features indicate the functionality being tracked.
 *
 * All Cody features must start with `cody.`, for example `cody.myFeature`.
 *
 * Features should NOT be 'scoped' to a specific extension - extension metadata
 * is already tracked separately. For example, do NOT use the feature name
 * 'vscode.cody.foobar', as we already know an event comes from VS Code - just
 * use 'cody.foobar' instead.
 */
export type EventFeature =
    // extension-setup-related events
    | 'cody.extension'
    // fixup-related events
    | 'cody.fixup'
    | 'cody.fixup.apply'
    // command-related events
    | 'cody.command'
    | 'cody.command.edit'
    // inline-assistant-related events
    | 'cody.comment'
    | 'cody.comment.delete'
    | 'cody.comment.stop'
    | 'cody.comment.collapse-all'
    | 'cody.comment.open-in-sidebar'
    | 'cody.interactive.clear'
    | 'cody.history'
    | 'cody.history.clear'
    // walkthrough/support-related events
    | 'cody.walkthrough'
    | 'cody.walkthrough.showExplain'
    | 'cody.walkthrough.enableInlineChat'
    // chat-related events
    | 'cody.editChatButton'
    | 'cody.sidebar.abortButton'
    | 'cody.app:download'
    | 'cody.app:connect'
    | 'cody.authReloadButton'
    // message-provider-related events
    | 'cody.messageProvider.chatReset'
    | 'cody.messageProvider.clearChatHistoryButton'
    | 'cody.messageProvider.restoreChatHistoryButton'
    | 'cody.messageProvider.chatResponse'
    | 'cody.recipe.chat-question'
    | 'cody.recipe.code-question'
    | 'cody.recipe.context-search'
    | 'cody.recipe.local-indexed-keyword-search'
    | 'cody.recipe.explain-code-detailed'
    | 'cody.recipe.explain-code-high-level'
    | 'cody.recipe.inline-touch'
    | 'cody.recipe.find-code-smells'
    | 'cody.recipe.fixup'
    | 'cody.recipe.generate-docstring'
    | 'cody.recipe.generate-unit-test'
    | 'cody.recipe.git-history'
    | 'cody.recipe.improve-variable-names'
    | 'cody.recipe.inline-chat'
    | 'cody.recipe.custom-prompt'
    | 'cody.recipe.next-questions'
    | 'cody.recipe.pr-description'
    | 'cody.recipe.release-notes'
    | 'cody.recipe.translate-to-language'
    | 'cody.guardrails.annotate'
    | 'cody.addCommandButton'
    | 'cody.sidebar.commandConfigMenuButton'
    | 'cody.command.openFile'
    | 'cody.command.resetChat'
    | 'cody.deleteChatHistoryButton'
    | 'cody.exportChatHistoryButton'

/**
 * Actions should denote a generic action within the scope of a feature. Where
 * possible, reuse an existing action.
 */
export type EventAction =
    | 'succeeded'
    | 'failed'
    | 'installed'
    | 'savedLogin'
    | 'executed'
    | 'created'
    | 'clicked'
    | 'opened'
    | 'closed'
    | 'hasCode'

/**
 * MetadataKey is an allowlist of keys for the safe-for-export metadata parameter.
 * Where possible, reuse an existing key.
 */
export type MetadataKey = 'durationMs' | 'lineCount' | 'charCount' | 'codeBlocks'

/**
 * Events accept metadata for ease of categorization in analytics pipelines -
 * this type enumerates known keys.
 */
export type TelemetryEventMetadataInput<MetadataKey> = 'location'

/**
 * Events accept billing metadata for ease of categorization in analytics
 * pipelines - this type enumerates known categories.
 */
export type BillingCategory = 'exampleBillingCategory'

/**
 * Events accept billing metadata for ease of categorization in analytics
 * pipelines - this type enumerates known products.
 */
export type BillingProduct = 'exampleBillingProduct'
