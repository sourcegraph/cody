import React from 'react'

export const EnhancedContextEnabled: React.Context<boolean> = React.createContext(true)

export function useEnhancedContextEnabled(): boolean {
    return React.useContext(EnhancedContextEnabled)
}
