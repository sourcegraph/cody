import type { Attribution, GuardrailsMode } from './index'
import { GuardrailsCheckStatus } from './index'

// TODO: currently unused - use or remove

/**
 * GuardrailsMetricEvent represents a metric event for guardrails usage
 */
export interface GuardrailsMetricEvent {
    // The type of action that triggered guardrails
    action: 'chat' | 'edit' | 'autocomplete'
    // The status of the guardrails check
    status: GuardrailsCheckStatus
    // The time it took to complete the check (in ms)
    duration: number
    // The guardrails mode being used
    mode: GuardrailsMode
    // Whether code was hidden due to enforced mode
    wasCodeHidden: boolean
    // Whether a respin was requested (if feature is available)
    wasRespinRequested?: boolean
    // Additional info for failed checks
    attributionDetails?: {
        // Number of repositories that matched
        matchCount: number
        // Whether the attribution limit was hit
        limitHit: boolean
    }
}

/**
 * Create a guardrails metric event from a check result
 */
export function createMetricFromCheck(
    action: GuardrailsMetricEvent['action'],
    startTime: number,
    status: GuardrailsCheckStatus,
    mode: GuardrailsMode,
    wasCodeHidden: boolean,
    attribution?: Attribution
): GuardrailsMetricEvent {
    const duration = Date.now() - startTime

    const event: GuardrailsMetricEvent = {
        action,
        status,
        duration,
        mode,
        wasCodeHidden,
    }

    if (attribution && status === GuardrailsCheckStatus.Failed) {
        event.attributionDetails = {
            matchCount: attribution.repositories.length,
            limitHit: attribution.limitHit,
        }
    }

    return event
}
