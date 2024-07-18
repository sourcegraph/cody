import { type CodyCommand, CodyIDE } from '@sourcegraph/cody-shared'
import { PlusIcon, ZapIcon } from 'lucide-react'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface CommandsTabProps {
    commands: CodyCommand[]
    IDE?: CodyIDE
}

const buttonClass =
    'tw-flex tw-text-foreground tw-border tw-border-border tw-bg-transparent hover:tw-text-muted-foreground tw-py-3 tw-items-end tw-border-none tw-transition-all tw-justify-start'

const CommandButton: React.FC<CodyCommand> = ({ key, description }) => (
    <button
        key={key}
        onClick={() =>
            getVSCodeAPI().postMessage({ command: 'command', id: 'cody.action.command', arg: key })
        }
        type="button"
        className={buttonClass}
    >
        <span className="tw-truncate">
            <ZapIcon className="tw-inline-flex" size={13} />
            <span className="tw-px-2">{description ?? key}</span>
        </span>
    </button>
)

const AddCustomCommandButton: React.FC = () => (
    <button
        key="new"
        onClick={() => getVSCodeAPI().postMessage({ command: 'command', id: 'cody.menu.custom.build' })}
        type="button"
        className={buttonClass}
        title="Create a reusable command."
    >
        <span className="tw-truncate">
            <PlusIcon className="tw-inline-flex" size={13} />
            <span className="tw-px-2">New Custom Command</span>
        </span>
    </button>
)

export const CommandsTab: React.FC<CommandsTabProps> = ({ commands, IDE }) => {
    const defaultCommands = commands.filter(c => c.type === 'default' && c.prompt)
    const customCommands = commands.filter(c => c.type !== 'default')
    return (
        <div className="tw-container tw-mx-auto tw-flex tw-flex-col tw-px-8 tw-pt-4">
            <p className="tw-text-muted-foreground tw-mt-2">Commands</p>
            <div className="tw-flex tw-flex-col tw-items-start">
                {defaultCommands.map(CommandButton)}
                {IDE === CodyIDE.VSCode && (
                    <div>
                        <p className="tw-text-muted-foreground tw-mt-2">Custom Commands</p>
                        {customCommands.map(CommandButton)}
                        <AddCustomCommandButton />
                    </div>
                )}
            </div>
        </div>
    )
}
