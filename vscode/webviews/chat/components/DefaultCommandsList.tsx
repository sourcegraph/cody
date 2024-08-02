import {
    BookIcon,
    FileQuestionIcon,
    GavelIcon,
    type LucideIcon,
    PencilLine,
    PencilRulerIcon,
    TextSearchIcon,
} from 'lucide-react'
import { type FunctionComponent, useMemo } from 'react'
import { CodyCommandMenuItems, type MenuCommand, type MenuCommandAccessor } from '../../../src/commands'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'
import { Button } from '../../components/shadcn/ui/button'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

interface Command {
    key: MenuCommand
    command: string
    title: string
    Icon: LucideIcon
}

function mkCommand(key: MenuCommand, Icon: LucideIcon, overrides: Partial<Command> = {}): Command {
    return {
        ...commandMap[key],
        ...overrides,
        Icon,
    }
}

const commandMap = CodyCommandMenuItems.reduce(
    (acc, item) => {
        acc[item.key] = item
        return acc
    },
    {} as { [key in MenuCommand]: MenuCommandAccessor }
)

const edit = mkCommand('edit', PencilLine)
const doc = mkCommand('doc', BookIcon)
const explain = mkCommand('explain', FileQuestionIcon)
const test = mkCommand('test', GavelIcon)
const smell = mkCommand('smell', TextSearchIcon)
const custom = mkCommand('custom', PencilRulerIcon)

const secondCommandMap: Partial<{ [command in MenuCommand]: Command }> = {
    edit,
    doc,
    explain,
    test,
    smell,
    custom,
}

// const defaultCommands = [edit, doc, explain, test, smell]

export const DefaultCommandsList: FunctionComponent<{
    commands: MenuCommand[]
    setView?: (view: View) => void
    initialOpen: boolean
}> = ({ commands, setView, initialOpen }) => {
    const commandList = useMemo(
        () => commands.map(command => secondCommandMap[command]).filter(Boolean),
        [commands]
    ) as Command[]

    return (
        <CollapsiblePanel title="Commands" initialOpen={initialOpen}>
            {commandList.map(({ command, title, Icon }) => (
                <Button
                    key={command}
                    variant="ghost"
                    className="tw-text-left"
                    onClick={() => {
                        getVSCodeAPI().postMessage({ command: 'command', id: command })
                        setView?.(View.Chat)
                    }}
                >
                    <Icon className="tw-w-8 tw-h-8 tw-opacity-80" size={16} strokeWidth="1.25" />
                    <span className="tw-truncate tw-w-full">{title}</span>
                </Button>
            ))}
        </CollapsiblePanel>
    )
}
