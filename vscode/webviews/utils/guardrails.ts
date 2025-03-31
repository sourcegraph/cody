import type { Guardrails } from '@sourcegraph/cody-shared'
import type { Attribution } from '@sourcegraph/cody-shared/src/guardrails'

/**
 * A mock implementation of guardrails for testing. Acts as if Guardrails
 * is disabled:
 * - Nothing requires attribution.
 * - Code is not hidden.
 * - Expects no calls to fetch attribution.
 */
export class MockNoGuardrails implements Guardrails {
    searchAttribution(snippet: string): Promise<Attribution | Error> {
        throw new Error('should not request attribution when it is not required')
    }

    needsAttribution(params: { code: string; language?: string }): boolean {
        return false
    }

    shouldHideCodeBeforeAttribution = false
}
