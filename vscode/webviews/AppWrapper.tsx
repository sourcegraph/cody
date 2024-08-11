import { PromptEditorConfigProvider } from '@sourcegraph/prompt-editor'
import type { ComponentProps, FunctionComponent, ReactNode } from 'react'
import { ClientActionListenersContextProvider } from './client/clientState'
import { TooltipProvider } from './components/shadcn/ui/tooltip'
import { promptEditorConfig } from './promptEditor/config'
import { ComposedWrappers, type Wrapper } from './utils/composeWrappers'

export const AppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => (
    <ComposedWrappers wrappers={COMMON_WRAPPERS}>{children}</ComposedWrappers>
)

export const COMMON_WRAPPERS: Wrapper[] = [
    {
        component: TooltipProvider,
        props: { disableHoverableContent: true, delayDuration: 600 },
    } satisfies Wrapper<any, ComponentProps<typeof TooltipProvider>>,
    {
        component: ClientActionListenersContextProvider,
    },
    {
        provider: PromptEditorConfigProvider,
        value: promptEditorConfig,
    } satisfies Wrapper<ComponentProps<typeof PromptEditorConfigProvider>['value']>,
]
