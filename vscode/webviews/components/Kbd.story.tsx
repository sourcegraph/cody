import type { Meta, StoryObj } from '@storybook/react'
import { Kbd } from './Kbd'

const meta: Meta<typeof Kbd> = {
    title: 'ui/Kbd',
    component: Kbd,
    decorators: [],
}

export default meta

type Story = StoryObj<typeof Kbd>

export const Default: Story = {
    args: {
        variant: 'default',
        macOS: 'cmd l',
        linuxAndWindows: 'alt l',
    },
    render: ({ macOS, linuxAndWindows, variant }) => (
        <div className="tw-grid tw-gap-5">
            <Kbd variant={variant} macOS={macOS} linuxAndWindows={linuxAndWindows} />
            <Kbd variant={variant} macOS="cmd r" linuxAndWindows="alt r" />
            <Kbd variant={variant} macOS="shift r" linuxAndWindows="shift r" />
            <Kbd variant={variant} macOS="OPT r" linuxAndWindows="SHIFT r" />
            <Kbd variant={variant} macOS="ctrl r" linuxAndWindows="shift r" />
            <Kbd variant={variant} macOS="return" linuxAndWindows="return" />
            <Kbd variant={variant} macOS="esc" linuxAndWindows="esc" />
            <Kbd variant={variant} macOS="CMD" linuxAndWindows="ALT" />
            <Kbd variant={variant} macOS="@" linuxAndWindows="@" />
        </div>
    ),
}
