import { VSCodeButton, VSCodeDropdown } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'
import type { CustomComponentPropsWithRef, FunctionComponent, LegacyRef, PropsWithChildren } from 'react'
import styles from './ToolbarButton.module.css'

// The components in this file are wrappers of other components with the right styles applied for
// the editor toolbar. This makes it so that all of those styles are in one place instead of being
// scattered (which makes it easy to introduce styling inconsistencies).

type VSCodeButtonProps = CustomComponentPropsWithRef<typeof VSCodeButton>

export const ToolbarButton: FunctionComponent<
    PropsWithChildren<
        Partial<Pick<VSCodeButtonProps, 'type' | 'onClick' | 'disabled' | 'title' | 'className'>>
    >
> = ({ className, children, ...props }) => (
    <VSCodeButton className={classNames(styles.button, className)} {...props}>
        {children}
    </VSCodeButton>
)

export const ToolbarPopoverButton: FunctionComponent<PropsWithChildren<{ className?: string }>> = ({
    className,
    children,
}) => (
    <ToolbarButton type="button" className={classNames(styles.popoverButton, className)}>
        {children}
        <div slot="end" className={styles.end}>
            <i className="codicon codicon-chevron-down" />
        </div>
    </ToolbarButton>
)

type VSCodeDropdownProps = CustomComponentPropsWithRef<typeof VSCodeDropdown>

export const ToolbarDropdownButton: FunctionComponent<
    PropsWithChildren<
        Partial<
            Pick<
                VSCodeDropdownProps,
                | 'value'
                | 'onChange'
                | 'onClickCapture'
                | 'disabled'
                | 'title'
                | 'aria-label'
                | 'className'
            >
        > & { ref?: LegacyRef<VSCodeDropdownProps> }
    >
> = ({ className, ref, ...props }) => (
    <VSCodeDropdown className={classNames(styles.dropdownButton, className)} {...props} />
)
