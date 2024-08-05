import type { CodyCommand, CodyIDE } from '@sourcegraph/cody-shared'
import type { View } from '../tabs/types'
import { CustomCommandsList } from './CustomCommandsList'
import { DefaultCommandsList } from './DefaultCommandsList'

export const PromptsTab: React.FC<{
    setView: (view: View) => void
    commands: CodyCommand[]
    IDE?: CodyIDE
}> = ({ commands, IDE, setView }) => (
    <div className="tw-flex tw-flex-col tw-gap-8 tw-px-8 tw-py-6">
        <DefaultCommandsList IDE={IDE} setView={setView} initialOpen={true} />
        {commands.length > 0 && (
            <CustomCommandsList commands={commands} IDE={IDE} setView={setView} initialOpen={true} />
        )}
    </div>
)
