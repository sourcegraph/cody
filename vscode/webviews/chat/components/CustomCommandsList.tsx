import { type CodyCommand, CodyIDE, CustomCommandType } from '@sourcegraph/cody-shared'
import { PencilRulerIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { Button } from '../../components/shadcn/ui/button'
import { Collapsible } from '../../components/shadcn/ui/collapsible'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

export const CustomCommandsList: FunctionComponent<{
    commands: CodyCommand[]
    IDE?: CodyIDE
    setView: (view: View) => void
}> = ({ commands, IDE, setView }) => {
    const customCommandsList = commands.filter(
        c => c.type === CustomCommandType.Workspace || c.type === CustomCommandType.User
    )

    if (IDE !== CodyIDE.VSCode || !customCommandsList.length) {
        return null
    }

    const customCommands = customCommandsList.map(({ key, prompt, description }) => (
        <Button
            key={key}
            variant="text"
            size="none"
            onClick={() => {
                getVSCodeAPI().postMessage({ command: 'command', id: 'cody.action.command', arg: key })
                setView(View.Chat)
            }}
            className="tw-px-2 hover:tw-bg-button-background-hover"
            title={description ?? prompt}
        >
            <PencilRulerIcon className="tw-inline-flex" size={13} />
            <span className="tw-px-4 tw-truncate tw-w-full">{key}</span>
        </Button>
    ))

    return <Collapsible title="Custom Commands" items={customCommands} />
}
