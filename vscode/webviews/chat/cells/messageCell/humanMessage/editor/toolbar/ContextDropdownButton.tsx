import type { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import {
    type Component,
    type CustomComponentPropsWithRef,
    type FunctionComponent,
    useCallback,
    useRef,
    useState,
} from 'react'
import { Popover } from '../../../../../../Components/Popover'
import styles from './ContextDropdownButton.module.css'
import { ToolbarPopoverButton } from './ToolbarButton'

export const ContextDropdownButton: FunctionComponent<{}> = ({}) => {
    const [isOpen, setIsOpen] = useState(false)
    const onButtonClick = useCallback(() => {
        setIsOpen(isOpen => !isOpen)
    }, [])

    const anchorRef = useRef<Component<CustomComponentPropsWithRef<typeof VSCodeButton>>>(null)
    return (
        <>
            <ToolbarPopoverButton ref={anchorRef} onClick={onButtonClick}>
                Context
            </ToolbarPopoverButton>
            {anchorRef.current && (
                <Popover
                    anchor={anchorRef.current as any /* TODO!(sqs) */}
                    visible={isOpen}
                    className={styles.popover}
                >
                    <ContextSettings />
                </Popover>
            )}
        </>
    )
}

export const ContextSettings: FunctionComponent<{ className?: string }> = ({ className }) => (
    <div className={className}>
        <header>Automatic Context Sources</header>
    </div>
)
