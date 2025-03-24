import {
    type Guardrails,
    GuardrailsCheckStatus,
    type GuardrailsResult,
    isError,
} from '@sourcegraph/cody-shared'
import type { Attribution } from '@sourcegraph/cody-shared/src/guardrails'
import { LRUCache } from 'lru-cache'
import { RefreshCwIcon } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'
import { GuardrailsStatus } from './GuardrailsStatus'

interface GuardrailsApplicatorProps {
    code: string
    language?: string
    fileName?: string
    guardrails: Guardrails
    isCodeComplete: boolean
    children: (props: GuardrailsRenderProps) => React.ReactNode
}

function parseAttributionResult(result: Attribution | Error): GuardrailsResult {
    if (isError(result)) {
        return {
            status: GuardrailsCheckStatus.Error,
            error: result,
        }
    }
    if (result.repositories.length === 0) {
        return {
            status: GuardrailsCheckStatus.Success,
        }
    }
    return {
        status: GuardrailsCheckStatus.Failed,
        repositories: result.repositories,
    }
}

export interface GuardrailsRenderProps {
    // TODO: This should instead be the thing to display
    showCode: boolean
    guardrailsStatus: React.ReactNode
}

// A cache of Guardrails attribution results. Because React over-rendering can
// generate calls at 120 FPS, we cache the results of these calls. The cache
// can provide a synchronous view of results for use during rendering.
class GuardrailsCache {
    // A cache of results, keyed by the service.
    private readonly cache = new WeakMap<
        Guardrails,
        {
            // Attribution requests keyed by the code being searched for.
            attributionRequests: LRUCache<string, Promise<GuardrailsResult>>
            // Parsed attribution results.
            results: LRUCache<string, GuardrailsResult>
        }
    >()

    // Synchronously gets Guardrails status for the given code. This may
    // initiate requests if the code needs attribution and no attribution is in
    // flight. In that case, getStatus will return a status of "checking" and
    // later call updateStatus.
    getStatus(
        guardrails: Guardrails,
        isCodeComplete: boolean,
        code: string,
        language: string | undefined,
        updateStatus: (status: GuardrailsResult) => void
    ): GuardrailsResult {
        if (!isCodeComplete) {
            return {
                status: GuardrailsCheckStatus.GeneratingCode,
            }
        }
        if (!guardrails.needsAttribution({ code, language })) {
            return {
                status: GuardrailsCheckStatus.Skipped,
            }
        }
        const cache = this.cache.get(guardrails)
        const cachedResult = cache?.results.get(code)
        if (cachedResult) {
            return cachedResult
        }
        if (!cache?.attributionRequests.has(code)) {
            // Kick off a request so we are not lying that there is a request
            // in flight.
            this.searchAttribution(guardrails, code).then(updateStatus)
        }
        return {
            status: GuardrailsCheckStatus.Checking,
        }
    }

    // Calls the Guardrails service to attribute the specified code and updates
    // the cache with the result when done. If there is an existing in-flight
    // request, returns the existing Promise.
    private searchAttribution(guardrails: Guardrails, code: string): Promise<GuardrailsResult> {
        let cache = this.cache.get(guardrails)
        if (!cache) {
            cache = {
                attributionRequests: new LRUCache({ max: 100 }),
                results: new LRUCache({ max: 500 }),
            }
            this.cache.set(guardrails, cache)
        }
        let result = cache.attributionRequests.get(code)
        if (!result) {
            result = (async () => {
                try {
                    return parseAttributionResult(await guardrails.searchAttribution(code))
                } catch (error) {
                    return {
                        status: GuardrailsCheckStatus.Error,
                        error: error instanceof Error ? error : new Error(String(error)),
                    }
                }
            })()
            cache.attributionRequests.set(code, result)
            result.then(parsedResult => {
                if (cache.attributionRequests.get(code) === result) {
                    cache.results.set(code, parsedResult)
                    // This request is done, so clean up the cache of in-flight requests.
                    cache.attributionRequests.delete(code)
                }
            })
        }
        return result
    }

    // Deletes an entry from the cache. To retry a request, delete the old
    // result and reissue the request.
    delete(guardrails: Guardrails, code: string) {
        const cache = this.cache.get(guardrails)
        if (cache) {
            cache.attributionRequests.delete(code)
            cache.results.delete(code)
        }
    }
}

const guardrailsCache = new GuardrailsCache()

/**
 * GuardrailsApplicator is responsible for managing the state and logic of guardrails checks.
 * It handles when to trigger checks, stores results, and provides the appropriate UI state
 * based on the current guardrails mode and check status.
 *
 * It uses the shared guardrailsCheckManager to prevent redundant checks and maintain
 * consistent UI state across component re-renders.
 */
export const GuardrailsApplicator: React.FC<GuardrailsApplicatorProps> = ({
    code,
    language,
    fileName,
    guardrails,
    isCodeComplete,
    children,
}: GuardrailsApplicatorProps) => {
    // State which can trigger updating the guardrails status indicator.
    const [guardrailsResult, setGuardrailsResult] = useState(() =>
        // We throw away the asynchronous result from this getStatus call.
        // TypeScript can't tie the knot of the setGuardrailsResult type if we
        // use setGuardrailsResult here. Instead, we rely on the effect below
        // collecting the asynchronous result if necessary.
        guardrailsCache.getStatus(guardrails, isCodeComplete, code, language, () => {})
    )

    // Performs a guardrails check, if necessary. This is cheap to call
    // repeatedly: It only attempts a check when the code is complete and needs
    // a guardrails check; and multiple in-flight checks are de-duped. This sets
    // guardrailsResult, and may asynchronously update guardrailsResult as
    // checks complete.
    useEffect(() => {
        if (isCodeComplete) {
            if (!guardrails.needsAttribution({ code, language })) {
                setGuardrailsResult({
                    status: GuardrailsCheckStatus.Skipped,
                })
                return
            }
            setGuardrailsResult(
                guardrailsCache.getStatus(
                    guardrails,
                    isCodeComplete,
                    code,
                    language,
                    setGuardrailsResult
                )
            )
        }
    }, [guardrails, isCodeComplete, code, language])

    const hideCode =
        guardrails.shouldHideCodeBeforeAttribution &&
        ![GuardrailsCheckStatus.Skipped, GuardrailsCheckStatus.Success].includes(guardrailsResult.status)
    const showCode = !hideCode

    // Generate tooltip text based on check status
    const tooltip = useMemo(() => {
        switch (guardrailsResult.status) {
            case GuardrailsCheckStatus.GeneratingCode:
                return 'Generating code…'
            case GuardrailsCheckStatus.Checking:
                return 'Guardrails: Running code attribution check…'
            case GuardrailsCheckStatus.Success:
                return 'Guardrails check passed'
            case GuardrailsCheckStatus.Failed:
                return `Found in repositories: ${guardrailsResult.repositories
                    .map(repo => repo.name)
                    .join(', ')}…`
            case GuardrailsCheckStatus.Error:
                return `Guardrails API error: ${guardrailsResult.error?.message || 'Unknown error'}`
            default:
                return 'Guardrails status unknown'
        }
    }, [guardrailsResult])

    // Function to retry a check that errored (for example, encountered a
    // network error)
    const handleRetry = () => {
        // Delete the old result.
        guardrailsCache.delete(guardrails, code)
        // Set status to the best available (loading) state and update it later.
        setGuardrailsResult(
            guardrailsCache.getStatus(guardrails, isCodeComplete, code, language, setGuardrailsResult)
        )
    }

    const statusDisplay = (
        <>
            <GuardrailsStatus status={guardrailsResult.status} filename={fileName} tooltip={tooltip} />
            {guardrailsResult.status === GuardrailsCheckStatus.Error && (
                <button
                    className={styles.button}
                    type="button"
                    onClick={handleRetry}
                    title="Retry guardrails check"
                >
                    <div className={styles.iconContainer}>
                        <RefreshCwIcon size={14} />
                    </div>
                    <span className="tw-hidden xs:tw-block">Retry</span>
                </button>
            )}
        </>
    )

    // Render function that provides check status and UI state to children
    return (
        <>
            {children({
                showCode,
                guardrailsStatus: statusDisplay,
            })}
        </>
    )
}
