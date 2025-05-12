import type React from 'react'
import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { getVSCodeAPI } from './VSCodeApi'

type CopyHandler = (text: string, event?: 'Keydown' | 'Button') => void

type CopyHandlerContextType = {
    isInitialized: boolean
    registerHandler: (handler: CopyHandler) => () => void // Returns a cleanup function
}

const CopyHandlerContext = createContext<CopyHandlerContextType>({
    isInitialized: false,
    registerHandler: () => () => {}, // Default no-op
})

/**
 * Provider component that sets up a global copy event handler.
 * Manages a registry of copy handlers that will be called when copy events occur.
 */
export const CopyHandlerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Use a ref to avoid re-renders when handlers change
    const handlersRef = useRef<CopyHandler[]>([])

    const registerHandler = useCallback((handler: CopyHandler) => {
        handlersRef.current.push(handler)
        return () => {
            handlersRef.current = handlersRef.current.filter(h => h !== handler)
        }
    }, [])

    useEffect(() => {
        const handleCopyEvent = (event: ClipboardEvent) => {
            try {
                const selectedText = window.getSelection()?.toString() || ''
                if (!selectedText) return

                for (const handler of handlersRef.current) {
                    try {
                        handler(selectedText, 'Keydown')
                    } catch (error) {
                        console.error('Error in copy handler:', error)
                    }
                }
                getVSCodeAPI().postMessage({
                    command: 'copy',
                    text: selectedText,
                    eventType: 'Keydown',
                })
            } catch (error) {
                console.error('Error handling copy event:', error)
            }
        }

        document.addEventListener('copy', handleCopyEvent)
        return () => {
            document.removeEventListener('copy', handleCopyEvent)
        }
    }, [])

    const contextValue = useRef<CopyHandlerContextType>({
        isInitialized: true,
        registerHandler,
    }).current

    return <CopyHandlerContext.Provider value={contextValue}>{children}</CopyHandlerContext.Provider>
}

/**
 * Hook to register a copy handler that will be called when copy events occur.
 * @param handler Function to be called when text is copied
 */
export function useRegisterCopyHandler(handler?: CopyHandler): void {
    const { registerHandler } = useContext(CopyHandlerContext)

    useEffect(() => {
        if (!handler) return

        // Register handler and store cleanup function
        const cleanup = registerHandler(handler)
        return cleanup
    }, [handler, registerHandler])
}

/**
 * Hook that ensures the copy handler system is initialized.
 * Call this in components that need copy events to be handled but don't need
 * to register their own custom handlers.
 */
export function useCopyHandler(): void {
    useContext(CopyHandlerContext)
}
