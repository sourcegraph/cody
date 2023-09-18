declare const BRAND: unique symbol

/**
 * Creates a new branded type by intersecting a given type with an object
 * containing a unique brand symbol.
 */
export type Brand<T, B> = T & { [BRAND]: B }

/** Creates a new branded type by intersecting a given type with an object containing a unique brand symbol. */
export function toBrandedType<T, B>(value: T, _brand: B): Brand<T, B> {
    return value as Brand<T, B>
}
