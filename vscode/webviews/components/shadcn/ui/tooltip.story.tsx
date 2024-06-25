import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../../../vscode/webviews/storybook/VSCodeStoryDecorator'
import { Kbd } from '../../Kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

const meta: Meta<typeof Tooltip> = {
    title: 'ui/Tooltip',
    component: Tooltip,

    argTypes: {
        open: {
            control: { type: 'boolean' },
        },
        children: {
            control: { type: 'text' },
        },
    },

    args: {
        open: true,
        children: 'This is a tooltip',
    },

    render: ({ open, children }) => {
        return (
            <Tooltip open={open ? open : undefined}>
                <TooltipTrigger>Text</TooltipTrigger>
                <TooltipContent>{children}</TooltipContent>
            </Tooltip>
        )
    },

    decorators: [VSCodeStandaloneComponent],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    args: {},
}

export const KeyboardShortut: StoryObj<
    React.ComponentProps<typeof Tooltip> & {
        macOS: string
        linuxAndWindows: string
    }
> = {
    args: {
        macOS: 'cmd+k',
        linuxAndWindows: 'ctrl+k',
    },
    render: ({ open, children, macOS, linuxAndWindows }) => {
        return (
            <Tooltip open={open ? open : undefined}>
                <TooltipTrigger>Text</TooltipTrigger>
                <TooltipContent>
                    {children}
                    <Kbd macOS={macOS} linuxAndWindows={linuxAndWindows} />
                </TooltipContent>
            </Tooltip>
        )
    },
}

export const LongContent: StoryObj<typeof meta> = {
    args: {
        children:
            'This is a tooltip with a really long content that should wrap. This is a tooltip with a really long content that should wrap.',
    },
}
