export const IGNORED_INFO_SYMBOL: ReadonlyArray<string> = []

export const IGNORED_PROPERTIES: ReadonlyArray<string> = [
    'npm @sourcegraph/telemetry ', // Too many complicated types from this package
    '`inline-completion-item-provider-config-singleton.ts`/tracer0:',
    '`observable.d.ts`/Subscription#',
    '`provider.ts`/Provider#configSource',
    '`StatusBar.ts`/CodyStatusBar',
    'lexicalEditor/`nodes.ts`/content0',
]

export const IGNORED_TYPE_REFS: ReadonlyArray<string> = [
    '`provider.ts`/Provider#',
    'npm @sourcegraph/telemetry', // Too many complicated types from this package
    '/TelemetryEventParameters#',
    ' lib/`lib.es5.d.ts`/Omit#',
]

/*
Types listed in this array will allow for loose subtyping of their members
By default the type `Item` below would not be allowed
interface HasTitle {
    kind: 'has-title'
    title: string
}

interface HasDescription {
    kind: 'has-description'
    description: string
}

type Item = {
    title?: string
    description?: string
} & (HasTitle | HasDescription)

but with `ALLOW_SUBTYPING_FOR_MEMBERS` set to ['Item'] the above type would be
allowed and would be generated with both title and description as nullable
even though one of them is required depending on the kind of the item
 */

export const ALLOW_SUBTYPING_FOR_MEMBERS: ReadonlyArray<string> = [
    'lexicalEditor/`nodes.ts`/SerializedContextItem#',
]
