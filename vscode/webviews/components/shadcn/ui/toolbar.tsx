import type { PopoverContentProps, PopoverProps } from '@radix-ui/react-popover'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import { ChevronDownIcon } from 'lucide-react'
import {
    type ButtonHTMLAttributes,
    type ComponentType,
    type KeyboardEventHandler,
    type PropsWithChildren,
    type ReactNode,
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react'
import { cn } from '../utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import styles from './toolbar.module.css'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

// NOTE(sqs): These components are not from shadcn, but they follow that convention. Some of the
// styling is still in CSS, not Tailwind.

const buttonVariants = cva('tw-border-none tw-flex tw-items-center focus-visible:tw-outline-none', {
    variants: {
        variant: {
            primary: '',
            secondary: '',
        },
    },
    defaultVariants: {
        variant: 'secondary',
    },
})

type IconComponent = ComponentType<{ width?: number | string; height?: number | string }>

interface ToolbarButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    tooltip?: ReactNode
    iconStart?: IconComponent
    iconEnd?: IconComponent | 'chevron' | null

    asChild?: boolean
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
    (
        {
            className,
            variant,
            asChild = false,
            tooltip,
            iconStart: IconStart,
            iconEnd: IconEnd,
            children,
            ...props
        },
        ref
    ) => {
        const Comp = asChild ? Slot : 'button'

        const button = (
            <Comp
                className={cn(buttonVariants({ variant, className }), styles.button, {
                    [styles.buttonPrimary]: variant === 'primary',
                    [styles.buttonSecondary]: variant === 'secondary',
                    [styles.buttonNoIconStart]: children && !IconStart,
                    [styles.buttonNoIconEnd]: children && !IconEnd,
                })}
                ref={ref}
                {...props}
            >
                {IconStart && <IconStart />}
                {children}
                {IconEnd && (IconEnd === 'chevron' ? <ChevronDownIcon /> : <IconEnd />)}
            </Comp>
        )

        return tooltip ? (
            <Tooltip>
                <TooltipTrigger asChild={true}>{button}</TooltipTrigger>
                <TooltipContent side="bottom">{tooltip}</TooltipContent>
            </Tooltip>
        ) : (
            button
        )
    }
)
ToolbarButton.displayName = 'ToolbarButton'

export const ToolbarPopoverItem = forwardRef<
    { open: () => void },
    PropsWithChildren<
        ButtonHTMLAttributes<HTMLButtonElement> &
            Omit<Pick<ToolbarButtonProps, 'iconStart' | 'tooltip'>, 'iconEnd'> & {
                iconEnd: ToolbarButtonProps['iconEnd'] | undefined
                popoverContent: (close: () => void) => React.ReactNode
                defaultOpen?: boolean
                onCloseByEscape?: () => void
                popoverRootProps?: Pick<PopoverProps, 'onOpenChange'>
                popoverContentProps?: Omit<PopoverContentProps, 'align'>
                __storybook__open?: boolean
            }
    >
>((props, ref) => {
    const {
        iconEnd = 'chevron',
        popoverContent,
        defaultOpen,
        onCloseByEscape,
        popoverRootProps,
        popoverContentProps,
        __storybook__open,
        children,
    } = props
    const [isOpen, setIsOpen] = useState(defaultOpen)
    useImperativeHandle(ref, () => ({
        open: () => setIsOpen(true),
    }))

    const onButtonClick = useCallback(() => {
        setIsOpen(isOpen => !isOpen)
    }, [])
    const anchorRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (__storybook__open) {
            setIsOpen(true)
        }
    }, [__storybook__open])

    // Expose the open method via ref
    useImperativeHandle(
        ref,
        () => ({
            open: () => setIsOpen(true),
        }),
        []
    )

    const popoverContentRef = useRef<HTMLDivElement>(null)

    const onOpenChange = useCallback(
        (open: boolean): void => {
            popoverRootProps?.onOpenChange?.(open)

            setIsOpen(open)

            // Ensure we blur the popover content if it was focused, because React's `onBlur`
            // doesn't get called when the focused event is unmounted (see
            // https://github.com/facebook/react/issues/12363#issuecomment-1988608527). This causes
            // a bug in our HumanMessageEditor where if you interact with any toolbar items that
            // steal focus for their menu, then the HumanMessageRow stays with partial focus
            // styling. See the "chat toolbar and row UI" e2e test.
            if (
                document.activeElement instanceof HTMLElement &&
                popoverContentRef.current?.contains(document.activeElement)
            ) {
                anchorRef.current?.focus()
            }
        },
        [popoverRootProps?.onOpenChange]
    )

    const close = useCallback(() => {
        onOpenChange(false)
    }, [onOpenChange])

    // After pressing Escape, return focus to the given component.
    const onKeyDownInPopoverContent = useCallback<KeyboardEventHandler<HTMLDivElement>>(
        event => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
            popoverContentProps?.onKeyDown?.(event)
        },
        [onCloseByEscape, popoverContentProps?.onKeyDown]
    )

    const finalIconEnd = iconEnd === null ? undefined : iconEnd
    const { iconEnd: _, ...restProps } = props

    return (
        <Popover open={isOpen} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
            <PopoverTrigger asChild={true}>
                <ToolbarButton
                    variant="secondary"
                    iconEnd={finalIconEnd}
                    ref={anchorRef}
                    onClick={onButtonClick}
                    {...restProps}
                >
                    {children}
                </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                onKeyDown={onKeyDownInPopoverContent}
                ref={popoverContentRef}
                {...popoverContentProps}
            >
                {popoverContent(close)}
            </PopoverContent>
        </Popover>
    )
})
ToolbarPopoverItem.displayName = 'ToolbarPopoverItem'
