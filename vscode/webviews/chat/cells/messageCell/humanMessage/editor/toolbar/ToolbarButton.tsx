import { VSCodeButton, VSCodeDropdown } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'
import {
    type CustomComponentPropsWithRef,
    type FunctionComponent,
    type PropsWithChildren,
    forwardRef,
} from 'react'
import styles from './ToolbarButton.module.css'

// The components in this file are wrappers of other components with the right styles applied for
// the editor toolbar. This makes it so that all of those styles are in one place instead of being
// scattered (which makes it easy to introduce styling inconsistencies).

type VSCodeButtonProps = CustomComponentPropsWithRef<typeof VSCodeButton>

export const ToolbarButton: FunctionComponent<
    PropsWithChildren<
        Partial<Pick<VSCodeButtonProps, 'type' | 'onClick' | 'disabled' | 'title' | 'className'>> & {
            ref?: VSCodeButtonProps['ref']
        }
    >
> = forwardRef(({ className, children, ...props }, ref) => (
    <VSCodeButton className={classNames(styles.button, className)} ref={ref} {...props}>
        {children}
    </VSCodeButton>
))

export const ToolbarPopoverButton: FunctionComponent<
    PropsWithChildren<
        Partial<Pick<VSCodeButtonProps, 'onClick' | 'title' | 'className'>> & {
            ref?: VSCodeButtonProps['ref']
        }
    >
> = forwardRef(({ className, children, ...props }, ref) => (
    <ToolbarButton
        type="button"
        className={classNames(styles.popoverButton, className)}
        ref={ref}
        {...props}
    >
        {children}
        <div slot="end" className={styles.end}>
            <i className="codicon codicon-chevron-down" />
        </div>
    </ToolbarButton>
))

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
        > & { ref?: VSCodeDropdownProps['ref'] }
    >
> = forwardRef(({ className, ...props }, ref) => (
    <VSCodeDropdown className={classNames(styles.dropdownButton, className)} ref={ref} {...props} />
))
