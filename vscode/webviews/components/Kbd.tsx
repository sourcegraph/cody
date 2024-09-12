import { isMacOS } from '@sourcegraph/cody-shared'
import {
    ArrowBigUpIcon,
    AtSignIcon,
    ChevronUpIcon,
    CommandIcon,
    CornerDownLeftIcon,
    OptionIcon,
} from 'lucide-react'
import type { FunctionComponent } from 'react'
import { cn } from './shadcn/utils'

const isMac = isMacOS()

function keyTextOrSvg(key: string): React.ReactElement | string {
    const iconClassName = 'tw-w-[1em] tw-h-[1em]'

    if (isMac) {
        switch (key.toLowerCase()) {
            case 'opt':
                return <OptionIcon className={iconClassName} />
            case 'cmd':
                return <CommandIcon className={iconClassName} />
            case 'ctrl':
                return <ChevronUpIcon className={cn(iconClassName, '-tw-translate-y-[.2em]')} />
            case '@':
                return <AtSignIcon className={cn(iconClassName)} />
        }
    }

    switch (key.toLowerCase()) {
        case 'return':
            return <CornerDownLeftIcon className={iconClassName} />
        case 'alt':
            return <OptionIcon className={iconClassName} />
        case 'ctrl':
            return <ChevronUpIcon className={cn(iconClassName, '-tw-translate-y-[.2em]')} />
        case 'shift':
            return <ArrowBigUpIcon className={iconClassName} />
        default:
            return <span>{key}</span>
    }
}

/** A component that displays a keyboard shortcut. */
export const Kbd: FunctionComponent<{
    macOS: string
    linuxAndWindows: string
    variant?: 'ghost' | 'default'
    className?: string
}> = ({ macOS, linuxAndWindows, variant = 'default', className }) => {
    const keys = (isMac ? macOS : linuxAndWindows).split(/[ \+]/)

    return (
        <kbd
            className={cn(
                'tw-inline-flex tw-items-stretch tw-gap-1.5 tw-text-sm tw-leading-none tw-uppercase tw-align-middle',
                className
            )}
        >
            {keys.map((key, index) => {
                return (
                    <span
                        key={key}
                        className="tw-flex tw-min-w-[1.5em] tw-justify-center tw-rounded tw-border tw-text-keybinding-foreground tw-border-keybinding-border tw-bg-keybinding-background tw-p-1"
                    >
                        {keyTextOrSvg(key)}
                    </span>
                )
            })}
        </kbd>
    )
}
