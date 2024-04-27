import { ChevronDownIcon } from '@heroicons/react/16/solid'
import classNames from 'classnames'
import {
    type ButtonHTMLAttributes,
    type ComponentType,
    type FunctionComponent,
    type PropsWithChildren,
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'
import styles from './Button.module.css'
import { Popover } from './Popover'

type IconComponent = ComponentType<{ width?: number | string; height?: number | string }>

type ButtonProps = {
    appearance: 'primary' | 'secondary'
    iconStart?: IconComponent
    iconEnd?: IconComponent | 'chevron'
}

export const Button = forwardRef<
    HTMLButtonElement,
    PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & ButtonProps
>(
    (
        {
            appearance,
            iconStart: IconStart,
            iconEnd: IconEnd,
            type = 'button',
            className,
            children,
            ...props
        },
        ref
    ) => (
        <button
            type={type}
            className={classNames(
                styles.button,
                {
                    [styles.buttonPrimary]: appearance === 'primary',
                    [styles.buttonSecondary]: appearance === 'secondary',
                    [styles.buttonNoIconStart]: !IconStart,
                    [styles.buttonIconEndChevron]: IconEnd === 'chevron',
                },
                className
            )}
            ref={ref}
            {...props}
        >
            {IconStart && <IconStart />}
            {children}
            {IconEnd && (IconEnd === 'chevron' ? <ChevronDownIcon /> : <IconEnd />)}
        </button>
    )
)

export const PopoverButton: FunctionComponent<
    PropsWithChildren<
        Pick<ButtonProps, 'iconStart'> &
            Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'className' | 'aria-label'> & {
                popoverContent: (close: () => void) => React.ReactNode

                onOpen?: () => void

                /** For storybooks only. */
                __storybook__open?: boolean
            }
    >
> = ({ popoverContent, onOpen, disabled, __storybook__open, children, ...props }) => {
    const [isOpen, setIsOpen] = useState(false)
    const onButtonClick = useCallback(() => {
        if (!isOpen) {
            onOpen?.()
        }
        setIsOpen(isOpen => !isOpen)
    }, [isOpen, onOpen])
    const anchorRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (__storybook__open) {
            setIsOpen(true)
        }
    }, [__storybook__open])

    const close = useCallback(() => {
        setIsOpen(false)
    }, [])

    return (
        <>
            <Button
                appearance="secondary"
                iconEnd={disabled ? undefined : 'chevron'}
                ref={anchorRef}
                onClick={onButtonClick}
                className={styles.popoverButton}
                disabled={disabled}
                role="combobox"
                {...props}
            >
                {children}
            </Button>
            {anchorRef.current && !disabled && (
                <Popover
                    anchor={anchorRef.current}
                    visible={isOpen}
                    className={styles.popoverButtonPopover}
                >
                    {popoverContent(close)}
                </Popover>
            )}
        </>
    )
}
