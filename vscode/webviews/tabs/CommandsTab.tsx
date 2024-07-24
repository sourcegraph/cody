import type { CodyCommand, CodyIDE } from '@sourcegraph/cody-shared'
import { CustomCommandsList } from '../chat/components/CustomCommandsList'
import { DefaultCommandsList } from '../chat/components/DefaultCommandsList'
import type { View } from './types'

interface CommandsTabProps {
    setView: (view: View) => void
    commands: CodyCommand[]
    IDE?: CodyIDE
}

export const CommandsTab: React.FC<CommandsTabProps> = ({ commands, IDE, setView }) => (
    <div className="tw-flex tw-flex-col tw-gap-4 tw-px-8">
        <DefaultCommandsList IDE={IDE} setView={setView} />
        {commands.length && <CustomCommandsList commands={commands} IDE={IDE} setView={setView} />}
    </div>
)
