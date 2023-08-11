import { FunctionComponent, memo } from 'react'

import { mdiGraphOutline, mdiMagnify } from '@mdi/js'

import { pluralize, PreciseContext } from '@sourcegraph/cody-shared'

import { TranscriptAction } from './actions/TranscriptAction'

export const PreciseContexts: FunctionComponent<{
    preciseContexts: PreciseContext[]
    serverEndpoint: string
    className?: string
}> = memo(function PreciseContextsContent({ preciseContexts, serverEndpoint, className }) {
    const unique = new Map<string, JSX.Element>()

    for (const { symbol, canonicalLocationURL } of preciseContexts) {
        const niceName = symbol.fuzzyName || symbol.scipDescriptorSuffix

        unique.set(
            symbol.scipName,
            serverEndpoint === '' ? (
                <span>{niceName}</span>
            ) : (
                <a href={join(serverEndpoint, canonicalLocationURL)}>{niceName}</a>
            )
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
})

const join = (...parts: string[]): string =>
    parts
        .map(part => (part.startsWith('/') ? part.slice(1) : part))
        .map(part => (part.endsWith('/') ? part.slice(0, -1) : part))
        .join('/')
