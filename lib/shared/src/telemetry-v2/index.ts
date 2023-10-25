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

/**
 * Actions should denote a generic action within the scope of a feature. Where
 * possible, reuse an existing action.
 */
export type EventAction = 'succeeded' | 'failed' | 'installed' | 'savedLogin' | 'executed' | 'created'

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
