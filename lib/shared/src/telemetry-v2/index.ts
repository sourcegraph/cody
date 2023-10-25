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

/**
 * MetadataKey is an allowlist of keys for the safe-for-export metadata parameter.
 * Where possible, reuse an existing key.
 */
export type MetadataKey = 'durationMs' | 'lineCount' | 'charCount'

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
