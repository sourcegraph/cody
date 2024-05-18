import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import { ChevronDownIcon } from 'lucide-react'
import {
    type ButtonHTMLAttributes,
    type ComponentType,
    type FunctionComponent,
    type KeyboardEventHandler,
    type PropsWithChildren,
    forwardRef,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'
import { cn } from '../utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import styles from './toolbar.module.css'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

// NOTE(sqs): These components are not from shadcn, but they follow that convention. Some of the
// styling is still in CSS, not Tailwind.

const buttonVariants = cva(
    'tw-border-none tw-flex tw-items-center focus-visible:tw-outline-none disabled:!tw-opacity-100',
    {
        variants: {
            variant: {
                primary: '',
                secondary: '',
            },
        },
        defaultVariants: {
            variant: 'secondary',
        },
    }
)

type IconComponent = ComponentType<{ width?: number | string; height?: number | string }>

export interface ToolbarButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    tooltip?: string
    iconStart?: IconComponent
    iconEnd?: IconComponent | 'chevron'

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
                <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
        ) : (
            button
        )
    }
)
ToolbarButton.displayName = 'ToolbarButton'

export const ToolbarPopoverItem: FunctionComponent<
    PropsWithChildren<
        ButtonHTMLAttributes<HTMLButtonElement> &
            Pick<ToolbarButtonProps, 'iconStart' | 'tooltip'> & {
                popoverContent: (close: () => void) => React.ReactNode

                defaultOpen?: boolean

                onCloseByEscape?: () => void

                /** For storybooks only. */
                __storybook__open?: boolean
            }
    >
> = ({ popoverContent, defaultOpen, onCloseByEscape, __storybook__open, children, ...props }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen)
    const onButtonClick = useCallback(() => {
        setIsOpen(isOpen => !isOpen)
    }, [])
    const anchorRef = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (__storybook__open) {
            setIsOpen(true)
        }
    }, [__storybook__open])

    const close = useCallback(() => {
        setIsOpen(false)
    }, [])

    // After pressing Escape, return focus to the given component.
    const onKeyDown = useCallback<KeyboardEventHandler<HTMLElement>>(
        event => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen} defaultOpen={defaultOpen}>
            <PopoverTrigger asChild={true}>
                <ToolbarButton
                    variant="secondary"
                    iconEnd="chevron"
                    ref={anchorRef}
                    onClick={onButtonClick}
                    {...props}
                >
                    {children}
                </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent align="start" onKeyDown={onKeyDown}>
                {popoverContent(close)}
            </PopoverContent>
        </Popover>
    )
}
