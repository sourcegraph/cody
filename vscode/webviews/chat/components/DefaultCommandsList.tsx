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
import { ExpandableContainer } from '../../components/ExpandableContainer'
import { Button } from '../../components/shadcn/ui/button'
import { getVSCodeAPI } from '../../utils/VSCodeApi'

const commonCommandList = [
    { key: 'cody.command.edit-code', title: 'Edit Code', icon: PencilLineIcon },
    { key: 'cody.command.document-code', title: 'Document Code', icon: BookIcon },
    { key: 'cody.command.explain-code', title: 'Explain Code', icon: FileQuestionIcon },
    { key: 'cody.command.unit-tests', title: 'Generate Unit Tests', icon: GavelIcon },
    { key: 'cody.command.smell-code', title: 'Find Code Smells', icon: TextSearchIcon },
]

const vscodeCommandList = [
    { key: 'cody.menu.custom-commands', title: 'Custom Commands', icon: PencilRulerIcon },
]

export const DefaultCommandsList: FunctionComponent<{ IDE?: CodyIDE }> = ({ IDE }) => {
    const commandList = useMemo(
        () => [...commonCommandList, ...(IDE === CodyIDE.VSCode ? vscodeCommandList : [])],
        [IDE]
    )

    const commands = commandList.map(({ key, title, icon: Icon }) => (
        <Button
            key={key}
            variant="ghost"
            onClick={() => getVSCodeAPI().postMessage({ command: 'command', id: key })}
        >
            <Icon className="tw-w-8 tw-h-8" size={16} strokeWidth="1.25" />
            <span className="tw-text-left tw-truncate tw-w-full">{title}</span>
        </Button>
    ))

    return <ExpandableContainer title="Commands" items={commands} />
}
