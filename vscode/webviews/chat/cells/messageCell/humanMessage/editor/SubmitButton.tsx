import { isMacOS } from '@sourcegraph/cody-shared'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import type { FunctionComponent } from 'react'
import styles from './SubmitButton.module.css'

export const SubmitButton: FunctionComponent<{
    onClick: () => void
    disabled?: boolean
}> = ({ onClick, disabled }) => (
    <>
        <VSCodeButton
            type="submit"
            onClick={onClick}
            appearance="secondary"
            aria-label="Submit message"
            className={styles.button}
            disabled={disabled}
        >
            Chat <kbd>{/* TODO!(sqs): factor out */ isMacOS() ? 'Opt' : 'Alt'}+⏎</kbd>
        </VSCodeButton>
        <VSCodeButton
            type="submit"
            onClick={onClick}
            appearance="primary"
            aria-label="Submit message"
            className={styles.button}
            disabled={disabled}
        >
            Chat with context <kbd>{/* TODO!(sqs): factor out */ isMacOS() ? '⌘' : 'Ctrl'}+⏎</kbd>
        </VSCodeButton>
    </>
)
