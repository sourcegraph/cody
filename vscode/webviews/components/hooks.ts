import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react'

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

export const useSuppressKeys = () => {
    useEffect(() => {
        let isCtrlXActive = false

        // For users with Emacs keybindings, suppress the 'k' key when Ctrl+X is active (this closes the current buffer)
        const handleKeyDown = (event: KeyboardEvent) => {
            let shouldSuppress = false

            if (isCtrlXActive && (event.code === 'KeyK' || event.code === 'KeyO')) {
                shouldSuppress = true
            }
            if (event.key === 'x' && event.ctrlKey && !event.shiftKey && !event.metaKey) {
                isCtrlXActive = true
            } else {
                isCtrlXActive = false
            }

            // On macOS, suppress the '¬' character emitted by default for alt+L
            const suppressedKeys = ['¬', 'Ò', '¿', '÷']
            if (event.altKey && suppressedKeys.includes(event.key)) {
                shouldSuppress = true
            }

            if (shouldSuppress) {
                event.preventDefault()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [])
}
