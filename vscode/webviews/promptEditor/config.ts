import type { SerializedContextItem } from '@sourcegraph/cody-shared'
import type { PromptEditorConfig } from '@sourcegraph/prompt-editor'
import { URI } from 'vscode-uri'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandLoading,
} from '../components/shadcn/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/shadcn/ui/tooltip'
import { getVSCodeAPI } from '../utils/VSCodeApi'

/**
 * This is for config that can't be passed via React context because Lexical nodes are rendered in
 * disconnected React DOM trees, so the context won't pass down.
 */
export const promptEditorConfig: PromptEditorConfig = {
    onContextItemMentionNodeMetaClick: (contextItem: SerializedContextItem) => {
        if (contextItem.uri) {
            const uri = URI.parse(contextItem.uri)
            getVSCodeAPI().postMessage({
                command: 'openURI',
                uri,
            })
        }
    },
    tooltipComponents: {
        Tooltip,
        TooltipContent,
        TooltipTrigger,
    },
    commandComponents: {
        Command: Command,
        CommandInput: CommandInput,
        CommandList: CommandList,
        CommandEmpty: CommandEmpty,
        CommandGroup: CommandGroup,
        CommandItem: CommandItem,
        CommandLoading: CommandLoading,
    },
}
