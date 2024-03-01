import type { FunctionComponent } from 'react'

import { mdiGraphOutline, mdiMagnify } from '@mdi/js'

import { type PreciseContext, pluralize } from '@sourcegraph/cody-shared'

import { TranscriptAction } from './actions/TranscriptAction'

export interface SymbolLinkProps {
    symbol: string
    path: string
    range?: PreciseContext['range']
}

export const PreciseContexts: FunctionComponent<{
    preciseContexts: PreciseContext[]
    symbolLinkComponent: FunctionComponent<SymbolLinkProps>
    className?: string
}> = ({ preciseContexts, symbolLinkComponent: SymbolLink, className }) => {
    const unique = new Map<string, JSX.Element>()

    for (const { symbol, filePath: filepath, range } of preciseContexts) {
        unique.set(
            symbol.fuzzyName || '',
            <SymbolLink symbol={symbol.fuzzyName || 'Unknown'} path={filepath} range={range} />
        )
    }
    const uniqueContext = Array.from(unique, ([hoverText, object]) => ({
        object,
        hoverText,
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
}
