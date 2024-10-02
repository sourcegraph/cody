import type { Constructor } from 'type-fest'
import type { Session } from './internal'

export class SessionChild {
    private static caches = new WeakMap<Constructor<any>, WeakMap<Session, InstanceType<any>>>()
    constructor(protected readonly session: Session) {}

    static for<C extends Constructor<SessionChild>>(
        this: C,
        session: Session,
        ...args: any[]
    ): InstanceType<C> {
        // biome-ignore lint/complexity/noThisInStatic: We're referring to the deriving class
        let classCache = SessionChild.caches.get(this)
        if (!classCache) {
            classCache = new WeakMap<Session, C>()
            // biome-ignore lint/complexity/noThisInStatic: We're referring to the deriving class
            SessionChild.caches.set(this, classCache)
        }

        // Check if an instance for this session already exists in the cache
        if (!classCache.has(session)) {
            // biome-ignore lint/complexity/noThisInStatic: We're referring to the deriving class
            classCache.set(session, new this(session, ...args))
        }

        return classCache.get(session) as InstanceType<C>
    }
}
