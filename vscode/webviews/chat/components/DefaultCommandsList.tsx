import { CodyIDE } from '@sourcegraph/cody-shared'
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

const defaultCommands = [edit, doc, explain, test, smell]

const commandsByIDE: { [key in CodyIDE]?: Command[] } = {
    [CodyIDE.VSCode]: [...defaultCommands, custom],
    [CodyIDE.Eclipse]: [],
}

export const DefaultCommandsList: FunctionComponent<{
    IDE?: CodyIDE
    setView?: (view: View) => void
    initialOpen: boolean
}> = ({ IDE, setView, initialOpen }) => {
    const commandList = useMemo(() => (IDE && commandsByIDE[IDE]) ?? defaultCommands, [IDE])

    return (
        <CollapsiblePanel title="Commands" initialOpen={initialOpen}>
            IDE: {IDE}
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
