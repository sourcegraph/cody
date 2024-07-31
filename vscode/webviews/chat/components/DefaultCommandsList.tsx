import { CodyIDE } from '@sourcegraph/cody-shared'
import {
    BookIcon,
    FileQuestionIcon,
    GavelIcon,
    PencilLineIcon,
    PencilRulerIcon,
    TextSearchIcon,
} from 'lucide-react'
import { type FunctionComponent, useMemo } from 'react'
import { CollapsiblePanel } from '../../components/CollapsiblePanel'
import { Button } from '../../components/shadcn/ui/button'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

const commonCommandList = [
    { key: 'cody.command.edit-code', title: 'Edit Code', icon: PencilLineIcon, href: null},
    { key: 'cody.command.document-code', title: 'Document Code', icon: BookIcon, href: null},
    { key: 'cody.command.explain-code', title: 'Explain Code', icon: FileQuestionIcon, href: null},
    { key: 'cody.command.unit-tests', title: 'Generate Unit Tests', icon: GavelIcon, href: null},
    { key: 'cody.command.smell-code', title: 'Find Code Smells', icon: TextSearchIcon, href: null},
]

const vscodeCommandList = [
    { key: 'cody.menu.custom-commands', title: 'Custom Commands', icon: PencilRulerIcon, href: <a href="https://sourcegraph.com">Import to Prompt Library</a>},]

export const DefaultCommandsList: FunctionComponent<{
    IDE?: CodyIDE
    setView?: (view: View) => void
    initialOpen: boolean
}> = ({ IDE, setView, initialOpen }) => {
    const commandList = useMemo(
        () => [...commonCommandList, ...(IDE === CodyIDE.VSCode ? vscodeCommandList : [])],
        [IDE]
    )

    return (
        <CollapsiblePanel title="Prompts" initialOpen={initialOpen}>
            {commandList.map(({ key, title, icon: Icon, href}) => (
                <Button
                    key={key}
                    variant="ghost"
                    className="tw-text-left tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2"
                    onClick={() => {
                        getVSCodeAPI().postMessage({ command: 'command', id: key })
                        setView?.(View.Chat)
                    }}
                >
                    <div className="tw-flex tw-items-center tw-gap-2 tw-flex-grow">
                        <Icon className="tw-w-8 tw-h-8 tw-opacity-80 tw-shrink-0" size={16} strokeWidth="1.25" />
                        <span className="tw-truncate">{title}</span>
                    </div>
                    {href && <span className="tw-text-sm tw-text-blue-500">{href}</span>}
                </Button>
            ))}
        </CollapsiblePanel>
    )
}
