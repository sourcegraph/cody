import type * as React from 'react'
import type { ContentMatch } from './types'

// biome-ignore lint/complexity/noBannedTypes:
type Merge<P1 = {}, P2 = {}> = Omit<P1, keyof P2> & P2

export type ForwardReferenceExoticComponent<E, OwnProps> = React.ForwardRefExoticComponent<
    Merge<E extends React.ElementType ? React.ComponentPropsWithRef<E> : never, OwnProps & { as?: E }>
>

type PropsWithChildren<P> = P &
    ({ children?: React.ReactNode | undefined } | { children: (...args: any[]) => React.ReactNode })

export interface ForwardReferenceComponent<
    IntrinsicElementString,
    OwnProps = unknown,
    /**
     * Extends original type to ensure built in React types play nice
     * with polymorphic components still e.g. `React.ElementRef` etc.
     */
> extends ForwardReferenceExoticComponent<IntrinsicElementString, OwnProps> {
    /**
     * When `as` prop is passed, use this overload.
     * Merges original own props (without DOM props) and the inferred props
     * from `as` element with the own props taking precedence.
     *
     * We explicitly avoid `React.ElementType` and manually narrow the prop types
     * so that events are typed when using JSX.IntrinsicElements.
     */
    <As = IntrinsicElementString>(
        props: As extends ''
            ? { as: keyof JSX.IntrinsicElements }
            : As extends React.ComponentType<PropsWithChildren<infer P>>
              ? Merge<P, OwnProps & { as: As }>
              : As extends keyof JSX.IntrinsicElements
                ? Merge<JSX.IntrinsicElements[As], OwnProps & { as: As }>
                : never
    ): React.ReactElement | null
}

/**
 * Converts the number of repo stars into a string, formatted nicely for large numbers
 */
export const formatRepositoryStarCount = (repoStars?: number): string | undefined => {
    if (repoStars !== undefined) {
        if (repoStars > 1000) {
            return `${(repoStars / 1000).toFixed(1)}k`
        }
        return repoStars.toString()
    }
    return undefined
}

export function getFileMatchUrl(base: string, fileMatch: ContentMatch): string {
    const revision = getRevision(fileMatch.branches, fileMatch.commit)
    const encodedFilePath = fileMatch.path.split('/').map(encodeURIComponent).join('/')
    return `${base}${fileMatch.repository}${revision ? '@' + revision : ''}/-/blob/${encodedFilePath}`
}

export function getRevision(branches?: string[], version?: string): string {
    let revision = ''
    if (branches) {
        const branch = branches[0]
        if (branch !== '') {
            revision = branch
        }
    } else if (version) {
        revision = version
    }

    return revision
}

export function pluralize(string: string, count: number | bigint, plural = string + 's'): string {
    // @ts-ignore
    return count === 1 || count === 1n ? string : plural
}
