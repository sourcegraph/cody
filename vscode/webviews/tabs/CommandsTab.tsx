import type { CodyCommand, CodyIDE } from '@sourcegraph/cody-shared'
import type { MenuCommand } from '../../src/commands'
import { CustomCommandsList } from '../chat/components/CustomCommandsList'
import { DefaultCommandsList } from '../chat/components/DefaultCommandsList'
import type { View } from './types'

interface CommandsTabProps {
    setView: (view: View) => void
    commands: CodyCommand[]
    allowedCommands: MenuCommand[]
    IDE?: CodyIDE
}

export const CommandsTab: React.FC<CommandsTabProps> = ({ allowedCommands, commands, IDE, setView }) => (
    <div className="tw-flex tw-flex-col tw-gap-8 tw-px-8 tw-py-6">
        <DefaultCommandsList commands={allowedCommands} setView={setView} initialOpen={true} />
        {commands.length && (
            <CustomCommandsList commands={commands} IDE={IDE} setView={setView} initialOpen={true} />
        )}
    </div>
)
