import { type CodyCommand, CodyIDE, CustomCommandType } from '@sourcegraph/cody-shared'
import { PencilRulerIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'
import { Button } from '../../components/shadcn/ui/button'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

export const CustomCommandsList: FunctionComponent<{ commands: CodyCommand[]; IDE?: CodyIDE }> = ({
    commands,
    IDE,
}) => {
    const customCommandsList = commands.filter(
        c => c.type === CustomCommandType.Workspace || c.type === CustomCommandType.User
    )

    if (IDE !== CodyIDE.VSCode || !customCommandsList.length) {
        return null
    }

    const customCommands = customCommandsList.map(({ key, prompt, description }) => (
        <Button
            key={key}
            variant="ghost"
            onClick={() =>
                getVSCodeAPI().postMessage({ command: 'command', id: 'cody.action.command', arg: key })
            }
            className="tw-text-left"
            title={description ?? prompt}
        >
            <PencilRulerIcon className="tw-w-8 tw-h-8" size={16} strokeWidth="1.25" />
            <span className="tw-truncate tw-w-full">{key}</span>
        </Button>
    ))

    return <CollapsiblePanel title="Custom Commands" items={customCommands} />
}
