/**
 * Create an async generator that yields the provided values.
 */
export async function* asyncGeneratorValues<T>(...yields: T[]): AsyncGenerator<T> {
    for (const value of yields) {
        yield value
    }
}

/**
 * Create an async generator that yields the result of the provided promise.
 */
export async function* asyncGeneratorFromPromise<T>(promise: Promise<T>): AsyncGenerator<T> {
    yield await promise
}

interface Disposable {
    dispose(): void
}

type VSCodeEvent<T> = (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => Disposable

export async function* asyncGeneratorFromVSCodeEvent<T>(event: VSCodeEvent<T>): AsyncGenerator<T> {
    let resolve: (value: T) => void
    let promise = new Promise<T>(r => {
        resolve = r
    })
    const disposable = event(e => {
        resolve(e)
        promise = new Promise<T>(r => {
            resolve = r
        })
    })
    try {
        while (true) {
            yield await promise
        }
    } finally {
        disposable.dispose()
    }
}

export async function firstValueFrom<T>(asyncGenerator: AsyncGenerator<T>): Promise<T> {
    for await (const value of asyncGenerator) {
        return value
    }
    throw new Error('no value from async generator')
}
