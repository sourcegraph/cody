import { NEVER } from '@sourcegraph/cody-shared'
import type { Observable } from 'observable-fns'

export function createInlineCompletionItemProvider(): Observable<void> {
    return NEVER
}
