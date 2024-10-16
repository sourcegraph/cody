import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'

export function useLocalStorage<T>(
    key: string,
    defaultValue?: T
): [T | undefined, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(() => {
        const json = localStorage.getItem(key)
        return json ? JSON.parse(json) : defaultValue
    })
    const persistValue = useCallback(
        (value: T | Dispatch<T>) => {
            setValue(current => {
                const newValue = typeof value === 'function' ? (value as (prev: T) => T)(current) : value
                localStorage.setItem(key, JSON.stringify(newValue))
                return newValue
            })
        },
        [key]
    )
    return [value, persistValue]
}
