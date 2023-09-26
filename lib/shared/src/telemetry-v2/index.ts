/**
 * Features indicate the functionality being tracked.
 *
 * Features should NOT be 'scoped' to a specific extension - extension metadata
 * is already tracked separately. For example, do not use feature name
 * 'vscode.cody.foobar', as we already know an event comes from VS Code - just
 * use 'cody.foobar' instead.
 */
export type EventFeature = 'exampleFeature' | 'cody' | 'cody.savedLogin' | 'cody.fixup'

/**
 * Actions should denote a generic action within the scope of a feature.
 */
export type EventAction = 'exampleAction' | 'installed' | 'executed' | 'created'

export type MetadataKey = 'exampleMetadata' | 'metadata'

export type BillingCategory = 'exampleBillingCategory'

export type BillingProduct = 'exampleBillingProduct'
