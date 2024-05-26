import { isMacOS } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'

const isMac = isMacOS()

/** A component that displays a keyboard shortcut. */
export const Kbd: FunctionComponent<{ macOS: string; linuxAndWindows: string; className?: string }> = ({
    macOS,
    linuxAndWindows,
    className,
}) => <kbd className={className}>{isMac ? macOS : linuxAndWindows}</kbd>
