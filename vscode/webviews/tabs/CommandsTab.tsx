import type { CodyCommand, CodyIDE } from '@sourcegraph/cody-shared'
import { DefaultCommandsList } from '../chat/components/DefaultCommandsList'

interface CommandsTabProps {
    commands: CodyCommand[]
    IDE?: CodyIDE
}

export const CommandsTab: React.FC<CommandsTabProps> = ({ commands, IDE }) => (
    <div className="tw-flex tw-flex-col tw-gap-4 tw-px-8">
        <DefaultCommandsList IDE={IDE} />
    </div>
)
