import { logError } from './logger'

type PromiseResolverFn<T, E> = (value?: T, err?: E) => void
/**
 * Creates a promise that can be resolved externally
 */
export function promise<T, E = any>(): [PromiseResolverFn<T, E>, Promise<T>] {
    let resolverFn: PromiseResolverFn<T, E> = undefined as any
    const internalPromise = new Promise<T>((resolve, reject) => {
        resolverFn = (value, err) => (err ? reject(err) : resolve(value!))
    })
    if (!resolverFn) {
        throw new Error('Unreachable code')
    }
    return [resolverFn!, internalPromise]
}

export function isError(value: unknown): value is Error {
    return value instanceof Error
}

/**
 * This is a little helper function that can be used to assert that all cases of a switch statement are handled.
 *
 * @example
 * const something : 'foo' | 'bar' | 'buz' = 'foo'
 * switch (something) {
 *   case 'foo':
 *     // ...
 *     break
 *   case 'bar':
 *     // ...
 *     break
 *   default:
 *      // gives a type and runtime error since we're not handling 'buz'
 *     assertUnreachable(something)
 * }
 */
export function assertUnreachable<T>(v: never): never
export function assertUnreachable<T>(v: T) {
    throw new Error(`Unreachable Code Path for <${v}>`)
}

// Converts a git clone URL to the codebase name that includes the slash-separated code host, owner, and repository name
// This should captures:
// - "github:sourcegraph/sourcegraph" a common SSH host alias
// - "https://github.com/sourcegraph/deploy-sourcegraph-k8s.git"
// - "git@github.com:sourcegraph/sourcegraph.git"
// - "https://dev.azure.com/organization/project/_git/repository"

export function convertGitCloneURLToCodebaseName(cloneURL: string): string | null {
    const result = convertGitCloneURLToCodebaseNameOrError(cloneURL)
    if (isError(result)) {
        if (result.message) {
            if (result.cause) {
                logError(
                    'convertGitCloneURLToCodebaseName',
                    result.message,
                    result.cause,
                    result.stack?.concat('\n')
                )
            } else {
                logError('convertGitCloneURLToCodebaseName', result.message, result.stack?.concat('\n'))
            }
        }
        return null
    }
    return result
}

// This converts a git clone URL to the what is *likely* the repoName on Sourcegraph.
// This is not guaranteed to be correct, and we should add an endpoint to Sourcegraph
// to resolve the repoName from the cloneURL.
export function convertGitCloneURLToCodebaseNameOrError(cloneURL: string): string | Error {
    if (!cloneURL) {
        return new Error(
            `Unable to determine the git clone URL for this workspace.\ngit output: ${cloneURL}`
        )
    }
    try {
        // Handle common Git SSH URL format
        const match = cloneURL.match(/^[\w-]+@([^:]+):([\w-]+)\/([\w-\.]+)$/)
        if (match) {
            const host = match[1]
            const owner = match[2]
            const repo = match[3].replace(/\.git$/, '')
            return `${host}/${owner}/${repo}`
        }
        const uri = new URL(cloneURL)
        // Handle Azure DevOps URLs
        if (uri.hostname?.includes('dev.azure') && uri.pathname) {
            return `${uri.hostname}${uri.pathname.replace('/_git', '')}`
        }
        // Handle GitHub URLs
        if (uri.protocol.startsWith('github') || uri.href.startsWith('github')) {
            return `github.com/${uri.pathname.replace('.git', '')}`
        }
        // Handle GitLab URLs
        if (uri.protocol.startsWith('gitlab') || uri.href.startsWith('gitlab')) {
            return `gitlab.com/${uri.pathname.replace('.git', '')}`
        }
        // Handle HTTPS URLs
        if (uri.protocol.startsWith('http') && uri.hostname && uri.pathname) {
            return `${uri.hostname}${uri.pathname.replace('.git', '')}`
        }
        // Generic URL
        if (uri.hostname && uri.pathname) {
            return `${uri.hostname}${uri.pathname.replace('.git', '')}`
        }
        return new Error('')
    } catch (error) {
        return new Error(`Cody could not extract repo name from clone URL ${cloneURL}:`, {
            cause: error,
        })
    }
}

/**
 * Creates a simple subscriber that can be used to register callbacks
 */
type Listener<T> = (value: T) => void
interface Subscriber<T> {
    subscribe(listener: Listener<T>): () => void
    notify(value: T): void
}

export function createSubscriber<T>(): Subscriber<T> {
    const listeners: Set<Listener<T>> = new Set()
    const subscribe = (listener: Listener<T>): (() => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    const notify = (value: T): void => {
        for (const listener of listeners) {
            listener(value)
        }
    }

    return {
        subscribe,
        notify,
    }
}

export function nextTick() {
    return new Promise(resolve => process.nextTick(resolve))
}

export type SemverString<Prefix extends string> = `${Prefix}${number}.${number}.${number}`

export namespace SemverString {
    const splitPrefixRegex = /^(?<prefix>.*)(?<version>\d+\.\d+\.\d+)$/
    export function forcePrefix<P extends string>(prefix: P, value: string): SemverString<P> {
        const match = splitPrefixRegex.exec(value)
        if (!match || !match.groups?.version) {
            throw new Error(`Invalid semver string: ${value}`)
        }
        return `${prefix}${match.groups?.version}` as SemverString<P>
    }
}

type TupleFromUnion<T, U = T> = [T] extends [never]
    ? []
    : T extends any
      ? [T, ...TupleFromUnion<Exclude<U, T>>]
      : []

// Helper type to ensure an array contains all members of T
export type ArrayContainsAll<T extends string> = TupleFromUnion<T>

/** Make T readonly (recursively). */
export type ReadonlyDeep<T> = {
    readonly [P in keyof T]: T[P] extends (infer U)[]
        ? ReadonlyArray<ReadonlyDeep<U>>
        : T[P] extends object
          ? ReadonlyDeep<T[P]>
          : T[P]
}

/** Make T partial (recursively). */
export type PartialDeep<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? Array<PartialDeep<U>>
        : T[P] extends object
          ? PartialDeep<T[P]>
          : T[P]
}
