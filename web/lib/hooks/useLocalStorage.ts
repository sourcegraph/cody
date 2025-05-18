import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'

/**
 * A hook that persists state in localStorage
 * 
 * @param key The key to store the value under in localStorage
 * @param defaultValue The default value to use if no value is found in localStorage
 * @returns A tuple containing the current value and a function to update it
 */
export function useLocalStorage<T>(
    key: string,
    defaultValue?: T
): [T | undefined, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(() => {
        const json = localStorage.getItem(key)
        if (!json) return defaultValue
        try {
            return JSON.parse(json)
        } catch {
            return defaultValue
        }
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