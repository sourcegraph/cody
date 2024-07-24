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
import { Button } from '../../components/shadcn/ui/button'
import { Collapsible } from '../../components/shadcn/ui/collapsible'
import { View } from '../../tabs/types'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

const commonCommandList = [
    { key: 'cody.command.edit-code', title: 'Edit Code', icon: PencilLineIcon },
    { key: 'cody.command.document-code', title: 'Document Code', icon: BookIcon },
    { key: 'cody.command.explain-code', title: 'Explain Code', icon: FileQuestionIcon },
    { key: 'cody.command.unit-tests', title: 'Generate Unit Tests', icon: GavelIcon },
    { key: 'cody.command.smell-code', title: 'Find Code Smell', icon: TextSearchIcon },
]

const vscodeCommandList = [
    { key: 'cody.menu.custom-commands', title: 'Custom Commands', icon: PencilRulerIcon },
]

export const DefaultCommandsList: FunctionComponent<{ IDE?: CodyIDE; setView?: (view: View) => void }> =
    ({ IDE, setView }) => {
        const commandList = useMemo(
            () => [...commonCommandList, ...(IDE === CodyIDE.VSCode ? vscodeCommandList : [])],
            [IDE]
        )

        const commands = commandList.map(({ key, title, icon: Icon }) => (
            <Button
                key={key}
                variant="text"
                size="none"
                className="tw-px-2 hover:tw-bg-button-background-hover"
                onClick={() => {
                    getVSCodeAPI().postMessage({ command: 'command', id: key })
                    setView?.(View.Chat)
                }}
            >
                <Icon className="tw-inline-flex" size={13} />
                <span className="tw-px-4 tw-truncate tw-w-full">{title}</span>
            </Button>
        ))

        return <Collapsible title="Commands" items={commands} />
    }
