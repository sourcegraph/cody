import type { SerializedContextItem } from '@sourcegraph/cody-shared'
import type { Command } from 'cmdk'
import { type ComponentProps, type ComponentType, createContext, useContext } from 'react'

/**
 * The configuration for the prompt editor and related components.
 */
export interface PromptEditorConfig {
    onContextItemMentionNodeMetaClick?: (contextItem: SerializedContextItem) => void

    /**
     * The [shadcn Tooltip components](https://ui.shadcn.com/docs/components/tooltip).
     */
    tooltipComponents?: {
        Tooltip: React.ComponentType<{ children: React.ReactNode }>
        TooltipContent: React.ComponentType<{ children: React.ReactNode }>
        TooltipTrigger: React.ComponentType<{ asChild?: boolean; children: React.ReactNode }>
    }

    /**
     * The [shadcn Command components](https://ui.shadcn.com/docs/components/command).
     */
    commandComponents: {
        Command: ComponentType<ComponentProps<typeof Command>>
        CommandInput: typeof Command.Input
        CommandList: typeof Command.List
        CommandEmpty: typeof Command.Empty
        CommandGroup: typeof Command.Group
        CommandItem: typeof Command.Item
        CommandLoading: typeof Command.Loading
    }
}

const PromptEditorConfigContext = createContext<PromptEditorConfig | undefined>(undefined)

/**
 * React hook for setting the configuration for the prompt editor and related components.
 */
export const PromptEditorConfigProvider = PromptEditorConfigContext.Provider

export function usePromptEditorConfig(): PromptEditorConfig {
    const config = useContext(PromptEditorConfigContext)
    if (!config) {
        throw new Error('usePromptEditorConfig must be called within a PromptEditorConfigProvider')
    }
    return config
}

/**
 * This hook must be called somewhere in the render tree. It is to apply config that can't be passed
 * via React context. Lexical nodes are rendered in disconnected React DOM trees, so the context
 * won't pass down.
 */
export function useSetGlobalPromptEditorConfig(): void {
    const config = useContext(PromptEditorConfigContext)
    if (!config) {
        throw new Error('useApplyPromptEditorConfig must be called within a PromptEditorConfigProvider')
    }
    setGlobalPromptEditorConfig(config)
}

/** The subset of the config that must be accessed globally (i.e. not passed via React context). */
type GlobalConfig = Pick<PromptEditorConfig, 'onContextItemMentionNodeMetaClick' | 'tooltipComponents'>

let globalConfig: GlobalConfig | undefined

function setGlobalPromptEditorConfig(config: GlobalConfig): void {
    globalConfig = config
}

/**
 * Return the global prompt editor config. Use {@link usePromptEditorConfig} from React. Only use
 * this if you need to access it outside of a React render tree.
 */
export function getGlobalPromptEditorConfig(): GlobalConfig {
    if (!globalConfig) {
        throw new Error('getGlobalPromptEditorConfig must be called after setGlobalPromptEditorConfig')
    }
    return globalConfig
}
