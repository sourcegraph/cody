import type { CodyCommand } from '@sourcegraph/cody-shared'
import { ZapIcon } from 'lucide-react'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface CommandsViewProps {
    commands: CodyCommand[]
}

const CommandButton: React.FC<CodyCommand> = ({ key, prompt, description }) => (
    <button
        key={key}
        onClick={() =>
            getVSCodeAPI().postMessage({ command: 'command', id: 'cody.action.command', args: key })
        }
        type="button"
        className="tw-flex tw-border tw-border-border tw-bg-transparent hover:tw-bg-muted-transparent hover:tw-text-muted-foreground tw-py-1 tw-items-end tw-border-none tw-opacity-50 hover:tw-opacity-100 tw-transition-all tw-justify-start"
        title={`Prompt: ${prompt}`}
    >
        <span className="tw-truncate">
            <ZapIcon className="tw-inline-flex" size={13} />
            <span className="tw-px-2">{description ?? key}</span>
        </span>
    </button>
)

export const CommandsView: React.FC<CommandsViewProps> = ({ commands }) => {
    const defaultCommands = commands.filter(c => c.type === 'default')
    const customCommands = commands.filter(c => c.type !== 'default')

    return (
        <div className="tw-container tw-mx-auto tw-flex tw-flex-col tw-px-8 tw-pt-4">
            <div className="tw-flex tw-flex-col tw-items-start">
                <p className="tw-mt-2">Commands</p>
                {defaultCommands.map(CommandButton)}
                <p className="tw-mt-2">Custom Commands</p>
                {customCommands.map(CommandButton)}
            </div>
        </div>
    )
}
