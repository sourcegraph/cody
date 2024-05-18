import { isMacOS } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { type FunctionComponent, type MouseEventHandler, useCallback, useEffect, useState } from 'react'
import { ToolbarButton } from '../../../../../../components/shadcn/ui/toolbar'
import { useEnhancedContextEnabled } from '../../../../../EnhancedContext'
import styles from './SubmitButton.module.css'

export const SubmitButton: FunctionComponent<{
    onClick: (withEnhancedContext: boolean) => void
    isEditorFocused?: boolean
    isParentHovered?: boolean
    disabled?: boolean
}> = ({ onClick: parentOnClick, isEditorFocused, isParentHovered, disabled }) => {
    const addEnhancedContext = useEnhancedContextEnabled()

    const [isAltKeyDown, setIsAltKeyDown] = useState(false)
    useEffect(() => {
        if (!isEditorFocused && !isParentHovered) {
            setIsAltKeyDown(false)
            return undefined
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.altKey) setIsAltKeyDown(true)
        }
        const onKeyUp = (event: KeyboardEvent) => {
            if (!event.altKey) setIsAltKeyDown(false)
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('keyup', onKeyUp)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('keyup', onKeyUp)
        }
    }, [isEditorFocused, isParentHovered])

    const onClick = useCallback<MouseEventHandler<HTMLButtonElement>>(() => {
        parentOnClick(!isAltKeyDown)
    }, [parentOnClick, isAltKeyDown])

    const withEnhancedContext = !isAltKeyDown && addEnhancedContext

    return (
        <ToolbarButton
            type="submit"
            variant="primary"
            tooltip={
                withEnhancedContext
                    ? `Hold <${ALT_KEY_NAME}> to chat w/o context`
                    : 'Use @-mentioned context only'
            }
            iconEnd={NO_ICON}
            onClick={onClick}
            aria-label="Submit message"
            className={clsx(styles.button, {
                [styles.editorFocused]: isEditorFocused || isParentHovered,
            })}
            disabled={disabled}
            tabIndex={-1} // press Enter to invoke, doesn't need to be tabbable
        >
            Chat{!withEnhancedContext && ' w/o context'}
            <kbd>
                {addEnhancedContext && isAltKeyDown ? `${ALT_KEY_NAME}+` : null}
                <EnterKeyIcon width={7} height={7} />
            </kbd>
        </ToolbarButton>
    )
}

const NO_ICON = () => null

const ALT_KEY_NAME = isMacOS() ? 'Opt' : 'Alt'

const EnterKeyIcon: FunctionComponent<{ width?: number | string; height?: number | string }> = ({
    width,
    height,
}) => (
    <svg
        width={width}
        height={height}
        viewBox="0 0 10 9"
        role="img"
        fill="currentColor"
        aria-label="Enter key icon"
    >
        <path d="M2.92725 7.99219C2.80371 7.99219 2.65869 7.93311 2.55664 7.83105L0.161133 5.48389C0.0537109 5.38184 0 5.24219 0 5.10254C0 4.96289 0.0537109 4.82324 0.161133 4.72119L2.55664 2.37402C2.65869 2.27734 2.80371 2.21826 2.92725 2.21826C3.2334 2.21826 3.43213 2.42236 3.43213 2.71777C3.43213 2.86816 3.37305 2.98096 3.28174 3.07227L2.27197 4.0498L1.55762 4.63525L2.54053 4.58691H7.62158C8.03516 4.58691 8.19629 4.42578 8.19629 4.01221V1.60059C8.19629 1.18701 8.03516 1.02588 7.62158 1.02588H5.41943C5.10791 1.02588 4.89307 0.794922 4.89307 0.515625C4.89307 0.230957 5.10791 0 5.41943 0H7.64307C8.75488 0 9.21143 0.456543 9.21143 1.56836V4.04443C9.21143 5.12939 8.75488 5.61816 7.64307 5.61816H2.54053L1.55762 5.56982L2.27197 6.15527L3.28174 7.13818C3.37305 7.22949 3.43213 7.33691 3.43213 7.49268C3.43213 7.78271 3.2334 7.99219 2.92725 7.99219Z" />
    </svg>
)
