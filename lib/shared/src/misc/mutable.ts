import { produce } from 'immer'
import { Observable, Subject } from 'observable-fns'
import type { ReadonlyDeep } from 'type-fest'
import { distinctUntilChanged, shareReplay, startWith } from './observable'

/**
 * Mutable is a class that helps you mutate an immutable state in such a way
 * that changes are observable. It uses ImmerJS under the hood to ensure to
 * ensure mutations are immutable...🤔
 * @example
 * ```ts
 * const quinn = {name: 'quinn'', age: 20}
 * const slack = {name: 'slack', age: 25}
 * const originalState = [quinn, slack]
 * const state = new Mutable<Array<{name: string, age: number}>>(originalState)
 *
 * const stateChanges = state.changes.map(console.log)
 *
 * state.mutate(draft => {
 *  // You can mutate the state as if you had a mutable reference
 *   draft[1].name = 'beyang'
 *   return draft
 * })
 *
 * // Prints: [{name: 'quinn', age: 20}, {name: 'beyang', age: 25}]
 * // BUT! now for the magic part:
 * originalState[0] === quinn // true
 * originalState[1] === slack // true
 * ```
 */
export class Mutable<T> {
    private inner: T
    private subject: Subject<T>

    public readonly changes: Observable<ReadonlyDeep<T>>
    constructor(initialValue: T) {
        this.inner = initialValue
        this.subject = new Subject<T>()

        this.changes = Observable.from(this.subject as Subject<ReadonlyDeep<T>>).pipe(
            // We're not forcing DeeplyFrozen as I trust people don't force-type cast
            startWith(this.inner as ReadonlyDeep<T>),
            // we can rely on fast strict equality here since we're using immer!
            distinctUntilChanged((a, b) => a === b),
            shareReplay()
        )
    }

    get current(): ReadonlyDeep<T> {
        // we're not forcing DeeplyFrozen as I trust people don't force-type cast
        return this.inner as ReadonlyDeep<T>
    }

    mutate(recipe: (draft: T) => T) {
        this.subject.next(produce(this.inner, recipe))
    }

    complete(): void {
        this.subject.complete()
    }
}
