type Singleton<T> = { instance: T | null }

export function singletonNotYetSet<T>(): Singleton<T> {
    return { instance: null }
}

export function setSingleton<T extends object>(container: Singleton<T>, instance: T): T {
    if (container.instance !== null) {
        throw new Error('singleton already set')
    }
    container.instance = instance
    return instance
}
