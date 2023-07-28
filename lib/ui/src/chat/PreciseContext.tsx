import { FunctionComponent, memo } from 'react'

import { mdiGraphOutline, mdiMagnify } from '@mdi/js'

import { pluralize, PreciseContext } from '@sourcegraph/cody-shared'

import { TranscriptAction } from './actions/TranscriptAction'

export const PreciseContexts: FunctionComponent<{
    preciseContexts: PreciseContext[]
    className?: string
}> = memo(function PreciseContextsContent({ preciseContexts, className }) {
    const unique = new Set<string>()
    for (const { scipSymbolName } of preciseContexts) {
        unique.add(scipSymbolName)
    }
    const uniqueContext = Array.from(unique)

    return (
        <TranscriptAction
            title={{
                verb: 'Read',
                object: `${uniqueContext.length} ${pluralize('precise name', uniqueContext.length)}`,
            }}
            steps={[
                { verb: 'Searched', object: 'entire codebase for relevant symbols', icon: mdiMagnify },
                ...uniqueContext.map(name => ({
                    verb: '',
                    object: name,
                    icon: mdiGraphOutline,
                })),
            ]}
            className={className}
        />
    )
})
