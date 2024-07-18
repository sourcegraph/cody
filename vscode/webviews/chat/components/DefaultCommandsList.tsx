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
import { Kbd } from '../../components/Kbd'
import { Button } from '../../components/shadcn/ui/button'
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

export const DefaultCommandsList: FunctionComponent<{ IDE?: CodyIDE }> = ({ IDE }) => {
    const commandList = useMemo(
        () => [...commonCommandList, ...(IDE === CodyIDE.VSCode ? vscodeCommandList : [])],
        [IDE]
    )

    const ListTitle: FunctionComponent<{ title: string }> = ({ title }) => (
        <div className="tw-flex tw-justify-between tw-py-3">
            <div>{title}</div>
            <Kbd macOS="opt+C" linuxAndWindows="alt+C" />
        </div>
    )

    return (
        <div className="tw-w-full tw-flex tw-flex-col tw-gap-2 tw-self-stretch">
            <ListTitle title="Commands" />
            <div className="tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg tw-items-baseline">
                {commandList.map(({ key, title, icon: Icon }) => (
                    <Button
                        key={key}
                        variant="text"
                        size="none"
                        onClick={() => getVSCodeAPI().postMessage({ command: 'command', id: key })}
                        className="tw-px-2 hover:tw-bg-button-background-hover"
                    >
                        <Icon className="tw-inline-flex" size={13} />
                        <span className="tw-px-4 tw-truncate tw-w-full">{title}</span>
                    </Button>
                ))}
            </div>
        </div>
    )
}
