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
    | 'cody.messageProvider.chatResponse.chat-question'
    | 'cody.messageProvider.chatResponse.code-question'
    | 'cody.messageProvider.chatResponse.context-search'
    | 'cody.messageProvider.chatResponse.local-indexed-keyword-search'
    | 'cody.messageProvider.chatResponse.explain-code-detailed'
    | 'cody.messageProvider.chatResponse.explain-code-high-level'
    | 'cody.messageProvider.chatResponse.inline-touch'
    | 'cody.messageProvider.chatResponse.find-code-smells'
    | 'cody.messageProvider.chatResponse.fixup'
    | 'cody.messageProvider.chatResponse.generate-docstring'
    | 'cody.messageProvider.chatResponse.generate-unit-test'
    | 'cody.messageProvider.chatResponse.git-history'
    | 'cody.messageProvider.chatResponse.improve-variable-names'
    | 'cody.messageProvider.chatResponse.inline-chat'
    | 'cody.messageProvider.chatResponse.custom-prompt'
    | 'cody.messageProvider.chatResponse.next-questions'
    | 'cody.messageProvider.chatResponse.pr-description'
    | 'cody.messageProvider.chatResponse.release-notes'
    | 'cody.messageProvider.chatResponse.translate-to-language'
    | 'cody.messageProvider.chatResponse.chat'
    | 'cody.messageProvider.chatResponse.editor'
    | 'cody.messageProvider.chatResponse.menu'
    | 'cody.messageProvider.chatResponse.code-action'
    | 'cody.messageProvider.chatResponse.custom-commands'
    | 'cody.messageProvider.chatResponse.test'
    | 'cody.messageProvider.chatResponse.code-lens'
    | 'cody.messageProvider.chatResponse.ask'
    | 'cody.messageProvider.chatResponse.doc'
    | 'cody.messageProvider.chatResponse.edit'
    | 'cody.messageProvider.chatResponse.explain'
    | 'cody.messageProvider.chatResponse.smell'
    | 'cody.messageProvider.chatResponse.reset'
    | 'cody.messageProvider.chatReset'
    | 'cody.messageProvider.clearChatHistoryButton'
    | 'cody.messageProvider.restoreChatHistoryButton'
    | 'cody.messageProvider.chatResponse'
    // recipe-related events
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
    | 'cody.command.openFile'
    | 'cody.command.resetChat'
    | 'cody.deleteChatHistoryButton'
    | 'cody.exportChatHistoryButton'
    // sidebar-related events
    | 'cody.sidebar.commandConfigMenuButton'
    | 'cody.sidebar.commandConfigMenuButton.undefined'
    | 'cody.sidebar.commandConfigMenuButton.menu'
    | 'cody.sidebar.commandConfigMenuButton.chat-question'
    | 'cody.sidebar.commandConfigMenuButton.code-question'
    | 'cody.sidebar.commandConfigMenuButton.context-search'
    | 'cody.sidebar.commandConfigMenuButton.local-indexed-keyword-search'
    | 'cody.sidebar.commandConfigMenuButton.explain-code-detailed'
    | 'cody.sidebar.commandConfigMenuButton.explain-code-high-level'
    | 'cody.sidebar.commandConfigMenuButton.inline-touch'
    | 'cody.sidebar.commandConfigMenuButton.find-code-smells'
    | 'cody.sidebar.commandConfigMenuButton.fixup'
    | 'cody.sidebar.commandConfigMenuButton.generate-docstring'
    | 'cody.sidebar.commandConfigMenuButton.generate-unit-test'
    | 'cody.sidebar.commandConfigMenuButton.git-history'
    | 'cody.sidebar.commandConfigMenuButton.improve-variable-names'
    | 'cody.sidebar.commandConfigMenuButton.inline-chat'
    | 'cody.sidebar.commandConfigMenuButton.custom-prompt'
    | 'cody.sidebar.commandConfigMenuButton.next-questions'
    | 'cody.sidebar.commandConfigMenuButton.pr-description'
    | 'cody.sidebar.commandConfigMenuButton.release-notes'
    | 'cody.sidebar.commandConfigMenuButton.translate-to-language'
    | 'cody.sidebar.commandConfigMenuButton.chat'
    | 'cody.sidebar.commandConfigMenuButton.editor'
    | 'cody.sidebar.commandConfigMenuButton.code-action'
    | 'cody.sidebar.commandConfigMenuButton.custom-commands'
    | 'cody.sidebar.commandConfigMenuButton.code-lens'
    | 'cody.sidebar.commandConfigMenuButton.test'
    | 'cody.sidebar.commandConfigMenuButton.ask'
    | 'cody.sidebar.commandConfigMenuButton.doc'
    | 'cody.sidebar.commandConfigMenuButton.edit'
    | 'cody.sidebar.commandConfigMenuButton.explain'
    | 'cody.sidebar.commandConfigMenuButton.smell'
    | 'cody.sidebar.commandConfigMenuButton.reset'
    // auth-provider-related events
    | 'cody.auth.login'
    | 'cody.auth.selectSigninMenu'
    | 'cody.auth.selectSigninMenu.enterprise'
    | 'cody.auth.selectSigninMenu.dotcom'
    | 'cody.auth.selectSigninMenu.token'
    | 'cody.auth.selectSigninMenu.app'
    | 'cody.auth.fromToken'
    | 'cody.auth.logout'
    | 'cody.auth.fromCallback.app'
    | 'cody.auth.fromCallback.web'
    // context-provider-related events
    | 'cody.auth'
    | 'cody.auth.app'

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
    | 'disconnected'
    | 'connected'

/**
 * MetadataKey is an allowlist of keys for the safe-for-export metadata parameter.
 * Where possible, reuse an existing key.
 */
export type MetadataKey = 'durationMs' | 'lineCount' | 'charCount' | 'codeBlocks' | 'embeddings' | 'local'

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
