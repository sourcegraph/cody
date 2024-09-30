import { Observable, Subject } from 'observable-fns'
import { shareReplay, startWith } from './observable'

export class ObservableArray<T> {
    private array: T[]
    private subject: Subject<T[]>
    // We're not forcing DeeplyFrozen as it's not our resposibility to monitor interior mutations
    private observable: Observable<ReadonlyArray<T>>

    constructor(initialArray: T[] = []) {
        this.array = [...initialArray]
        this.subject = new Subject<T[]>()
        this.observable = Observable.from(this.subject).pipe(startWith(this.array), shareReplay())
        this.notifySubscribers()
    }

    /**
     * Observable to subscribe to changes to the underlying state.
     *
     * TODO: We could get really fancy like Mobx and return a proxy Array or
     * something.
     */
    get changes() {
        return this.observable
    }

    public get(): ReadonlyArray<T> {
        return this.array
    }

    /**
     * Mutate the underlying state with a copy of the provided state.
     *
     * Note that modifying the array afterwards does not mutate the observable.
     */
    public set(newState: T[]) {
        this.array = [...newState]
        this.notifySubscribers()
    }

    // Mutating methods that trigger subscriptions
    public push(...items: T[]): number {
        const result = this.array.push(...items)
        this.notifySubscribers()
        return result
    }

    public pop(): T | undefined {
        const result = this.array.pop()
        this.notifySubscribers()
        return result
    }

    public unshift(...items: T[]): number {
        const result = this.array.unshift(...items)
        this.notifySubscribers()
        return result
    }

    public shift(): T | undefined {
        const result = this.array.shift()
        this.notifySubscribers()
        return result
    }

    public splice(start: number, deleteCount?: number, ...items: T[]): T[] {
        const result =
            deleteCount !== undefined
                ? this.array.splice(start, deleteCount, ...items)
                : this.array.splice(start)
        this.notifySubscribers()
        return result
    }

    public remove(item: any): T | null {
        const index = this.array.indexOf(item as any)
        if (index === -1) {
            return null
        }
        return this.splice(index)[0] ?? null
    }

    // Helper method to notify subscribers
    private notifySubscribers(): void {
        //Note: techncially we should clone the array here to prevent mutations
        //but this is only a little internal heleper wrapper so I'd like to
        //trust nobody does forced type-casts.
        this.subject.next(this.array)
    }
}
