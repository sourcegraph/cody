/**
 * Features indicate the functionality being tracked.
 *
 * Features should NOT be 'scoped' to a specific extension - extension metadata
 * is already tracked separately. For example, do not use feature name
 * 'vscode.cody.foobar', as we already know an event comes from VS Code - just
 * use 'cody.foobar' instead.
 */
export type EventFeature =
    | 'cody'
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

export type MetadataKey = 'metadata' | 'duration' | 'lineCount' | 'charCount'

export type BillingCategory = 'exampleBillingCategory'

export type BillingProduct = 'exampleBillingProduct'
