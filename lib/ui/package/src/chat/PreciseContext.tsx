import { FunctionComponent, memo } from 'react'

import { mdiGraphOutline, mdiMagnify } from '@mdi/js'

import { pluralize, PreciseContext } from '@sourcegraph/cody-shared'

import { TranscriptAction } from './actions/TranscriptAction'

export const PreciseContexts: FunctionComponent<{
    preciseContexts: PreciseContext[]
    className?: string
}> = memo(function PreciseContextsContent({ preciseContexts, className }) {
    const unique = new Map<string, string>()
    for (const { scipSymbolName, fuzzyToScipPair } of preciseContexts) {
        unique.set(scipSymbolName, fuzzyToScipPair)
    }
    const uniqueContext = Array.from(unique, ([scipSymbolName, fuzzyToScipPair]) => ({
        object: fuzzyToScipPair,
        hoverText: scipSymbolName,
    }))

    return (
        <TranscriptAction
            title={{
                verb: 'Read',
                object: `${uniqueContext.length} ${pluralize('precise name', uniqueContext.length)}`,
            }}
            steps={[
                { verb: 'Searched', object: 'entire codebase for relevant symbols', icon: mdiMagnify },
                ...uniqueContext.map(({ object, hoverText }) => ({
                    verb: '',
                    object,
                    icon: mdiGraphOutline,
                    hoverText,
                })),
            ]}
            className={className}
        />
    )
})
