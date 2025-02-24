import { Observable, map } from 'observable-fns'
import semver from 'semver'
import { authStatus } from '../auth/authStatus'
import type { AuthStatus } from '../auth/types'
import { logError } from '../logger'
import { distinctUntilChanged, pick, promiseFactoryToObservable } from '../misc/observable'
import {
    firstResultFromOperation,
    pendingOperation,
    switchMapReplayOperation,
} from '../misc/observableOperation'
import { isError } from '../utils'
import { isDotCom } from './environments'
import { graphqlClient } from './graphql'

interface SiteAndCodyAPIVersions {
    siteVersion: string
    codyAPIVersion: CodyApiVersion
}

/**
 * Observe the site version and Cody API version of the currently authenticated endpoint.
 *
 * TODO: `siteVersion` updates at most once per authStatus change. This means it can cache transient
 * errors, like network errors, indefinitely. Fix it to retry after transient failures.
 */
export const siteVersion: Observable<SiteAndCodyAPIVersions | null | typeof pendingOperation> =
    authStatus.pipe(
        pick('authenticated', 'endpoint', 'pendingValidation'),
        distinctUntilChanged(),
        switchMapReplayOperation(
            (
                authStatus
            ): Observable<SiteAndCodyAPIVersions | Error | null | typeof pendingOperation> => {
                if (authStatus.pendingValidation) {
                    return Observable.of(pendingOperation)
                }

                if (!authStatus.authenticated) {
                    return Observable.of(null)
                }
                return promiseFactoryToObservable(signal => graphqlClient.getSiteVersion(signal)).pipe(
                    map((siteVersion): SiteAndCodyAPIVersions | null | typeof pendingOperation => {
                        if (isError(siteVersion)) {
                            logError(
                                'siteVersion',
                                `Failed to get site version from ${authStatus.endpoint}: ${siteVersion}`
                            )
                            return null
                        }
                        return {
                            siteVersion,
                            codyAPIVersion: inferCodyApiVersion(siteVersion, isDotCom(authStatus)),
                        }
                    })
                )
            }
        ),
        map(result => (isError(result) ? null : result)) // the operation catches its own errors, so errors will never get here
    )

const authStatusAuthed: Observable<AuthStatus> = authStatus.filter(
    authStatus => authStatus.authenticated
)

/**
 * Get the current site version. If authentication is pending, it awaits successful authentication.
 */
export async function currentSiteVersion(): Promise<SiteAndCodyAPIVersions | Error> {
    const authStatus = await firstResultFromOperation(authStatusAuthed)
    const siteVersion = await graphqlClient.getSiteVersion()
    if (isError(siteVersion)) {
        logError('siteVersion', `Failed to get site version from ${authStatus.endpoint}: ${siteVersion}`)
        return siteVersion
    }
    return {
        siteVersion,
        codyAPIVersion: inferCodyApiVersion(siteVersion, isDotCom(authStatus)),
    }
}

interface CheckVersionInput {
    currentVersion: string
    minimumVersion: string
    insider?: boolean
}

export async function isValidVersion({ minimumVersion }: { minimumVersion: string }): Promise<boolean> {
    const currentVersion = await currentSiteVersion()

    if (isError(currentVersion)) {
        return false
    }

    return checkVersion({ minimumVersion, currentVersion: currentVersion.siteVersion })
}

/**
 * Checks if the current site version is valid based on the given criteria.
 *
 * @param options - The options for version validation.
 * @param options.minimumVersion - The minimum version required.
 * @param options.insider - Whether to consider insider builds as valid. Defaults to true.
 * @returns A promise that resolves to a boolean indicating if the version is valid.
 */
export function checkVersion({
    minimumVersion,
    currentVersion,
    insider = true,
}: CheckVersionInput): boolean {
    const isInsiderBuild = currentVersion.length > 12 || currentVersion.includes('dev')

    return (insider && isInsiderBuild) || semver.gte(currentVersion, minimumVersion)
}

type CodyApiVersion = 0 | 1 | 2

/** @internal Exported for testing only. */
export function inferCodyApiVersion(version: string, isDotCom: boolean): CodyApiVersion {
    const parsedVersion = semver.valid(version)
    const isLocalBuild = parsedVersion === '0.0.0'

    if (isDotCom || isLocalBuild) {
        // The most recent version is api-version=2, which was merged on 2024-09-11
        // https://github.com/sourcegraph/sourcegraph/pull/470
        return 2
    }

    // On Cloud deployments from main, the version identifier will use a format
    // like "2024-09-11_5.7-4992e874aee2", which does not parse as SemVer.  We
    // make a best effort go parse the date from the version identifier
    // allowing us to selectively enable new API versions on instances like SG02
    // (that deploy frequently) without crashing on other Cloud deployments that
    // release less frequently.
    const isCloudBuildFromMain = parsedVersion === null
    if (isCloudBuildFromMain) {
        const date = parseDateFromPreReleaseVersion(version)
        if (date && date >= new Date('2024-09-11')) {
            return 2
        }
        // It's safe to bump this up to api-version=2 after the 5.8 release
        return 1
    }

    // 5.8.0+ is the first version to support api-version=2.
    if (semver.gte(parsedVersion, '5.8.0')) {
        return 2
    }

    // 5.4.0+ is the first version to support api-version=1.
    if (semver.gte(parsedVersion, '5.4.0')) {
        return 1
    }

    return 0 // zero refers to the legacy, unversioned, Cody API
}

// Pre-release versions have a format like this "2024-09-11_5.7-4992e874aee2".
// This function return undefined for stable Enterprise releases like "5.7.0".
function parseDateFromPreReleaseVersion(version: string): Date | undefined {
    try {
        const dateString = version.split('_').at(1)
        if (!dateString) {
            return undefined
        }
        return new Date(dateString)
    } catch {
        return undefined
    }
}
