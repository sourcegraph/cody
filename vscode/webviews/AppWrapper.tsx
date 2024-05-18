import type { FunctionComponent, ReactNode } from 'react'
import { TooltipProvider } from './components/shadcn/ui/tooltip'

export const AppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
    return (
        <TooltipProvider disableHoverableContent={true} delayDuration={300}>
            {children}
        </TooltipProvider>
    )
}
