import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'
import type { FunctionComponent } from 'react'
import styles from './SubmitButton.module.css'

export const SubmitButton: FunctionComponent<{
    onClick: () => void
    isEditorFocused?: boolean
    isParentHovered?: boolean
    disabled?: boolean
}> = ({ onClick, isEditorFocused, isParentHovered, disabled }) => {
    return (
        <VSCodeButton
            type="submit"
            onClick={onClick}
            appearance="icon"
            aria-label="Submit message"
            className={classNames(styles.button, {
                [styles.editorFocused]: isEditorFocused || isParentHovered,
            })}
            disabled={disabled}
        >
            <span className={styles.icon}>
                <SubmitIcon size={16} />
            </span>
            Run
            <kbd>⏎</kbd>
        </VSCodeButton>
    )
}

const SubmitIcon: FunctionComponent<{ size: number }> = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label="Submit icon">
        <rect width="10" height="10" x="5" y="5" fill="currentColor" />
        <path
            className={styles.iconCircle}
            fillRule="evenodd"
            d="M0.25 10C0.25 4.615 4.615 0.25 10 0.25C15.385 0.25 19.75 4.615 19.75 10C19.75 15.385 15.385 19.75 10 19.75C4.615 19.75 0.25 15.385 0.25 10ZM14.274 9.017C14.4494 9.11442 14.5956 9.25699 14.6973 9.42992C14.7991 9.60285 14.8528 9.79985 14.8528 10.0005C14.8528 10.2012 14.7991 10.3982 14.6973 10.5711C14.5956 10.744 14.4494 10.8866 14.274 10.984L8.671 14.096C8.49979 14.191 8.30674 14.2397 8.11093 14.2373C7.91513 14.2348 7.72336 14.1813 7.55458 14.082C7.3858 13.9828 7.24586 13.8411 7.14859 13.6712C7.05133 13.5012 7.00011 13.3088 7 13.113V6.887C7 6.03 7.922 5.487 8.671 5.904L14.274 9.017Z"
        />
    </svg>
)
