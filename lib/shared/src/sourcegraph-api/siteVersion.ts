import { Observable, map } from 'observable-fns'
import semver from 'semver'
import { authStatus } from '../auth/authStatus'
import type { AuthStatus } from '../auth/types'
import { logError } from '../logger'
import { distinctUntilChanged, pick, promiseFactoryToObservable, retry } from '../misc/observable'
import {
    firstResultFromOperation,
    pendingOperation,
    switchMapReplayOperation,
} from '../misc/observableOperation'
import { isError } from '../utils'
import { isDotCom } from './environments'
import { graphqlClient } from './graphql'

// @link latestSupportedCompletionsStreamAPIVersion
// https://sourcegraph.sourcegraph.com/search?q=context:global+latestSupportedCompletionsStreamAPIVersion
type LegacyCodyApiVersion = 1 | 2 | 3 | 4
type V2TelemetryCodyApiVersion = 5
// Any number greater than 4 is considered a valid Cody API version
type CodyApiVersion = LegacyCodyApiVersion | number

export interface SiteAndCodyAPIVersions {
    siteVersion: string
    codyAPIVersion: CodyApiVersion
}

// Default minimum API version
export const DefaultMinimumAPIVersion: V2TelemetryCodyApiVersion = 5

// Starts with 0 to indicate that the latest version has not been set
let _LatestCodyAPIVersion: CodyApiVersion = 0

export function getLatestSupportedCompletionsStreamAPIVersion(): number {
    return _LatestCodyAPIVersion
}

// We will infer the Cody API version based on the site version if the version is not set
export function setLatestCodyAPIVersion(version?: number): void {
    if (version !== undefined) {
        _LatestCodyAPIVersion = version
    }
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
                    map((siteVersion): SiteAndCodyAPIVersions | Error => {
                        return isError(siteVersion)
                            ? siteVersion
                            : {
                                  siteVersion,
                                  codyAPIVersion: inferCodyApiVersion(siteVersion, isDotCom(authStatus)),
                              }
                    })
                )
            }
        ),
        retry(3),
        map(siteVersion => {
            if (isError(siteVersion)) {
                logError('siteVersion', `Failed to get site version: ${siteVersion}`)
                return null
            }

            return siteVersion
        })
    )

// Only emit when authenticated
const authStatusAuthed: Observable<AuthStatus> = authStatus.filter(auth => auth.authenticated)

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

    // Reset the latest Cody API version if the user is not authenticated
    const isDotComUser = isDotCom(authStatus)
    if (!authStatus.authenticated && !isDotComUser) {
        setLatestCodyAPIVersion(0)
    }

    return {
        siteVersion,
        codyAPIVersion: inferCodyApiVersion(siteVersion, isDotComUser),
    }
}

interface CheckVersionInput {
    currentVersion: string
    minimumVersion: string
    insider?: boolean
}

export async function isValidVersion({ minimumVersion }: { minimumVersion: string }): Promise<boolean> {
    const currentVersion = await currentSiteVersion()
    return (
        !isError(currentVersion) &&
        checkVersion({
            minimumVersion,
            currentVersion: currentVersion.siteVersion,
        })
    )
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

const LastKnownCodyAPIVersion = 8
const LOCAL_BUILD_VERSION_NUMBER = '0.0.0+dev'

export function serverSupportsPromptCaching(): boolean {
    // The first version that supports prompt caching
    return _LatestCodyAPIVersion >= 7
}

/** @internal Exported for testing only. */
export function inferCodyApiVersion(version: string, isDotCom: boolean): CodyApiVersion {
    // Fast path for dotcom or local dev
    if (isDotCom || version === LOCAL_BUILD_VERSION_NUMBER) {
        // Use the latest version if it has been set and is greater than the last known version
        if (_LatestCodyAPIVersion && _LatestCodyAPIVersion >= LastKnownCodyAPIVersion) {
            return _LatestCodyAPIVersion
        }
        return LastKnownCodyAPIVersion
    }

    // Use the latest version if it has been set
    if (_LatestCodyAPIVersion) {
        return _LatestCodyAPIVersion
    }

    const parsedVersion = semver.valid(version)

    // 5.4.0+ supports api-version=1
    // 5.8.0+ supports api-version=2
    if (parsedVersion && semver.gte(parsedVersion, '6.2.0')) {
        return 8
    }
    if (parsedVersion && semver.ltr(parsedVersion, '5.8.0')) {
        return 1
    }

    // Handle pre-release versions
    // On Cloud deployments from main, the version identifier will use a format
    // like "2024-09-11_5.7-4992e874aee2" or "6.1.x_313350_2025-02-25_6.1-63a41475e780",
    // which does not parse as SemVer.  We make a best effort go parse the date from
    // the version identifier allowing us to selectively enable new API versions on
    // instances like SG02 (that deploy frequently) without crashing on other Cloud
    // deployments that release less frequently.
    if (parsedVersion === null) {
        const date = parseDateFromPreReleaseVersion(version)
        if (date && date >= new Date('2025-03-11')) {
            return 8
        }
        if (date && date >= new Date('2024-09-11')) {
            return 5
        }
        return 1
    }

    // Use minimum version for all other cases instead of 0
    return DefaultMinimumAPIVersion
}

const versionRegexp = /^(?:[^_]+_)?\d+_(\d{4}-\d{2}-\d{2})_\d+\.\d+-\w+$/

// Pre-release versions have a format like this "2024-09-11_5.7-4992e874aee2" or "6.1.x_313350_2025-02-25_6.1-63a41475e780".
// This function return undefined for stable Enterprise releases like "5.7.0".
function parseDateFromPreReleaseVersion(version: string): Date | undefined {
    try {
        const match = version.match(versionRegexp)
        if (!match) {
            return undefined
        }
        const dateString = match[1]
        if (!dateString) {
            return undefined
        }
        return new Date(dateString)
    } catch {
        return undefined
    }
}
