import { FunctionComponent } from 'react'

import { mdiGraphOutline, mdiMagnify } from '@mdi/js'

import { pluralize, PreciseContext } from '@sourcegraph/cody-shared'

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
    const uniqueContext: { hoverText: string; object: JSX.Element }[] = []
    for (const { symbol, filePath, range } of preciseContexts) {
        const name = symbol.fuzzyName ? symbol.fuzzyName : 'unknown'

        uniqueContext.push({
            hoverText: name,
            object: <SymbolLink symbol={name} path={filePath} range={range} />,
        })
    }

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
