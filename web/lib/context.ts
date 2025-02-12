import { shareReplay } from '@sourcegraph/cody-shared'
import { Subject } from 'observable-fns'
import type { InitialContext } from './types'

const webInitialContextSubject = new Subject<InitialContext>()
export const webInitialContext = webInitialContextSubject.pipe(shareReplay())

export function setWebInitialContext(repo: InitialContext): void {
    webInitialContextSubject.next(repo)
}
