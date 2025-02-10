import { NEVER } from '@sourcegraph/cody-shared'
import type { Observable } from 'observable-fns'

export function createAutoEditsProvider(): Observable<void> {
    return NEVER
}

export function isUserEligibleForAutoeditsFeature(): boolean {
    return false
}
