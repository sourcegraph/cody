import { Observable, Subject } from 'observable-fns'
import { describe, expect, test, vi } from 'vitest'
import {
    combineLatest,
    debounceTime,
    filter,
    observableOfTimedSequence,
    promiseToObservable,
    readValuesFrom,
    shareReplay,
    testing__firstValueFromWithinTime,
} from './observable'
import { pendingOperation, switchMapReplayOperation } from './observableOperation'

describe('switchMapReplayOperation', () => {
    test('buffer is invalidated when outer observable emits again', async () => {
        vi.useFakeTimers()

        const subject = new Subject<string>()
        const runOperation = vi.fn(
            (c: string): Observable<string> =>
                promiseToObservable(new Promise<string>(resolve => setTimeout(resolve, 100, `${c}!`)))
        )
        const observable: Observable<string | typeof pendingOperation | Error> = subject.pipe(
            switchMapReplayOperation(c => runOperation(c)),
            filter((value): value is string => value !== pendingOperation)
        )

        const reader1a = readValuesFrom(observable)
        const reader1b = readValuesFrom(observable)
        expect(runOperation).toHaveBeenCalledTimes(0)
        expect(reader1a.values).toStrictEqual<string[]>([])
        expect(reader1b.values).toStrictEqual<string[]>([])
        await vi.advanceTimersByTimeAsync(0)
        expect(runOperation).toHaveBeenCalledTimes(0)
        expect(reader1a.values).toStrictEqual<string[]>([])
        expect(reader1b.values).toStrictEqual<string[]>([])

        subject.next('a')
        await vi.advanceTimersByTimeAsync(100)
        expect.soft(runOperation.mock.calls).toEqual([['a']])
        expect(runOperation).toHaveBeenCalledTimes(1)
        expect.soft(reader1a.values).toStrictEqual<string[]>(['a!'])
        expect(reader1b.values).toStrictEqual<string[]>(['a!'])
        reader1a.clearValues()
        reader1b.clearValues()
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toStrictEqual('a!')

        const reader2 = readValuesFrom(observable)
        expect(runOperation).toHaveBeenCalledTimes(1)
        expect(reader2.values).toStrictEqual<string[]>([])
        await vi.advanceTimersByTimeAsync(0)
        expect(runOperation).toHaveBeenCalledTimes(1)
        expect(reader2.values).toStrictEqual<string[]>(['a!'])
        reader2.clearValues()
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toStrictEqual('a!')

        // Emit 'b' from the subject and ensure that the cache is invalidated.
        subject.next('b')
        expect(runOperation).toHaveBeenCalledTimes(2)
        expect(reader1a.values).toStrictEqual<string[]>([])
        expect(reader1b.values).toStrictEqual<string[]>([])
        expect(reader2.values).toStrictEqual<string[]>([])
        // We wish the next line could equal `undefined`, but it can't because we haven't yielded
        // synchronous execution since `subject.next('b')` was called. Add an assertion for the
        // current behavior so we can detect if anything changes the behavior.
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toStrictEqual('a!')
        await vi.advanceTimersByTimeAsync(0)
        expect(runOperation).toHaveBeenCalledTimes(2)
        expect(reader1a.values).toStrictEqual<string[]>([])
        expect(reader1b.values).toStrictEqual<string[]>([])
        expect(reader2.values).toStrictEqual<string[]>([])
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toStrictEqual(
            undefined
        )

        // Now add a new reader. Since 'b' was emitted from the subject, we want it to NOT receive
        // the prior buffered emission.
        const reader3 = readValuesFrom(observable)
        expect(runOperation).toHaveBeenCalledTimes(2)
        expect(reader3.values).toStrictEqual<string[]>([])
        await vi.advanceTimersByTimeAsync(0)
        expect(reader3.values).toStrictEqual<string[]>([])
        reader3.clearValues()
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toStrictEqual(
            undefined
        )

        expect(reader1a.values).toStrictEqual<string[]>([])
        expect(reader1b.values).toStrictEqual<string[]>([])
        expect(reader2.values).toStrictEqual<string[]>([])
        await vi.advanceTimersByTimeAsync(100)
        expect(runOperation).toHaveBeenCalledTimes(2)
        expect(reader1a.values).toStrictEqual<string[]>(['b!'])
        expect(reader1b.values).toStrictEqual<string[]>(['b!'])
        expect(reader2.values).toStrictEqual<string[]>(['b!'])
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toStrictEqual('b!')

        reader1a.unsubscribe()
        await reader1a.done
        reader1b.unsubscribe()
        await reader1b.done
        reader2.unsubscribe()
        await reader2.done
        reader3.unsubscribe()
        await reader3.done
    })

    test('handles pendingOperation from source observable', async () => {
        vi.useFakeTimers()

        const subject = new Subject<string | typeof pendingOperation>()
        const runOperation = vi.fn((value: string) =>
            promiseToObservable(
                new Promise<string>(resolve => setTimeout(() => resolve(value + '!'), 100))
            )
        )
        const observable = subject.pipe(switchMapReplayOperation(runOperation))

        const { values, clearValues, unsubscribe, done } = readValuesFrom(observable)

        subject.next(pendingOperation)
        expect(runOperation).not.toHaveBeenCalled()
        expect(values).toStrictEqual([])

        await vi.advanceTimersByTimeAsync(0)
        expect(values).toStrictEqual([pendingOperation])
        clearValues()

        subject.next('a')
        expect(runOperation).toHaveBeenCalledTimes(1)
        expect(values).toStrictEqual([])
        clearValues()

        await vi.advanceTimersByTimeAsync(100)
        expect(values).toStrictEqual([pendingOperation, 'a!'])
        clearValues()

        unsubscribe()
        await done
    })

    test('nested operations', async () => {
        vi.useFakeTimers()

        const outer = Observable.of<string>('a').pipe(shareReplay())
        const innerSubject = new Subject<string>()
        const inner = innerSubject.pipe(shareReplay())

        const runOperation = vi.fn((outerValue: string, innerValue: string) =>
            Observable.of(`${outerValue} ${innerValue}`)
        )

        const observable = outer.pipe(
            switchMapReplayOperation(outerValue =>
                inner.pipe(switchMapReplayOperation(innerValue => runOperation(outerValue, innerValue)))
            )
        )
        const { values, clearValues, unsubscribe, done } = readValuesFrom(observable)

        await vi.advanceTimersByTimeAsync(0)
        innerSubject.next('x')
        await vi.advanceTimersByTimeAsync(0)
        expect(values).toStrictEqual<typeof values>([pendingOperation, pendingOperation, 'a x'])
        expect(runOperation).toBeCalledTimes(1)
        clearValues()
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toBe('a x')
        expect(runOperation).toBeCalledTimes(1)

        innerSubject.next('y')
        await vi.advanceTimersByTimeAsync(0)
        expect(values).toStrictEqual<typeof values>([pendingOperation, 'a y'])
        expect(runOperation).toBeCalledTimes(2)
        clearValues()
        await expect(testing__firstValueFromWithinTime(observable, 0, vi)).resolves.toBe('a y')
        expect(runOperation).toBeCalledTimes(2)

        unsubscribe()
        await done
    })

    test('combined operations emit @@pendingOperation together', async () => {
        vi.useFakeTimers()

        const outerSubject = new Subject<string>()
        const outer = outerSubject.pipe(shareReplay())
        const inner1 = outer.pipe(switchMapReplayOperation(c => observableOfTimedSequence(10, `${c}1`)))
        const inner2 = outer.pipe(switchMapReplayOperation(c => observableOfTimedSequence(10, `${c}2`)))
        const observable = combineLatest(outer, inner1, inner2).pipe(debounceTime(0))

        const { values, clearValues, done, unsubscribe } = readValuesFrom(observable)

        expect(values).toStrictEqual<typeof values>([])

        await vi.advanceTimersByTimeAsync(0)
        expect(values).toStrictEqual<typeof values>([])

        outerSubject.next('a')
        expect(values).toStrictEqual<typeof values>([])

        await vi.advanceTimersByTimeAsync(0)
        expect(values).toStrictEqual<typeof values>([['a', pendingOperation, pendingOperation]])
        clearValues()

        await vi.advanceTimersByTimeAsync(11)
        expect(values).toStrictEqual<typeof values>([['a', 'a1', 'a2']])
        clearValues()

        unsubscribe()
        await done
    })
})
