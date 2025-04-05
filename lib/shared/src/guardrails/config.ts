import { GuardrailsMode } from './index'

// Default guardrails configuration
const DEFAULT_GUARDRAILS_CONFIG = {
    mode: GuardrailsMode.Permissive,
    minLinesForCheck: 10,
    metricsEnabled: true,
}

/**
 * GuardrailsConfig handles configuration for the guardrails feature
 */
export interface GuardrailsConfig {
    // The enforcement mode for guardrails
    mode: GuardrailsMode
    // Minimum number of lines for a code block to be checked by guardrails
    minLinesForCheck: number
    // Whether to collect metrics for guardrails usage
    metricsEnabled: boolean
}

/**
 * Get the current guardrails configuration from storage or environment
 * For now, we just return a default config. Later this will be connected to
 * server-side settings or local storage.
 */
export function getGuardrailsConfig(): GuardrailsConfig {
    // In a future implementation, this would fetch from server or storage
    return DEFAULT_GUARDRAILS_CONFIG
}

/**
 * Update the guardrails configuration
 * For now, this doesn't persist changes. Later this will be connected to
 * server-side settings or local storage.
 */
export function setGuardrailsConfig(config: Partial<GuardrailsConfig>): GuardrailsConfig {
    // In a future implementation, this would persist to server or storage
    return {
        ...DEFAULT_GUARDRAILS_CONFIG,
        ...config,
    }
}
