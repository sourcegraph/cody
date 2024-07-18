import { type CodyCommand, CodyIDE } from '@sourcegraph/cody-shared'
import { ZapIcon } from 'lucide-react'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface CommandsTabProps {
    commands: CodyCommand[]
    IDE?: CodyIDE
}

const CommandButton: React.FC<CodyCommand> = ({ key, prompt, description }) => (
    <button
        key={key}
        onClick={() =>
            getVSCodeAPI().postMessage({ command: 'command', id: 'cody.action.command', arg: key })
        }
        type="button"
        className="tw-flex tw-text-foreground tw-border tw-border-border tw-bg-transparent hover:tw-bg-muted-transparent hover:tw-text-muted-foreground tw-py-1.5 tw-items-end tw-border-none tw-transition-all tw-justify-start"
        title={`Prompt: ${prompt}`}
    >
        <span className="tw-truncate">
            <ZapIcon className="tw-inline-flex" size={13} />
            <span className="tw-px-2">{description ?? key}</span>
        </span>
    </button>
)

export const CommandsTab: React.FC<CommandsTabProps> = ({ commands, IDE }) => {
    const defaultCommands = commands.filter(c => c.type === 'default')
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
                    </div>
                )}
            </div>
        </div>
    )
}
