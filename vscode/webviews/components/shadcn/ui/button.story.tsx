import type { Meta, StoryObj } from '@storybook/react'
import { ZapIcon } from 'lucide-react'
import { VSCodeStandaloneComponent } from '../../../../../vscode/webviews/storybook/VSCodeStoryDecorator'
import { Button } from './button'

const meta: Meta<typeof Button> = {
    title: 'ui/Button',
    component: Button,

    argTypes: {
        children: {
            control: { type: 'text' },
        },
    },

    decorators: [VSCodeStandaloneComponent],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    argTypes: {
        variant: {
            control: { type: 'radio' },
            options: ['default', 'outline', 'secondary', 'ghost', 'link'],
        },
    },

    args: {
        children: 'Some Button',
    },

    render: ({ variant, children }) => <Button variant={variant}>{children}</Button>,
}

export const Variants: StoryObj<typeof meta> = {
    args: {
        children: 'Some Button',
        disabled: false,
    },

    render: ({ children, disabled }) => (
        <div className="">
            <Button disabled={disabled} variant="default">
                {children}
            </Button>
            <Button disabled={disabled} variant="secondary">
                {children}
            </Button>
            <Button disabled={disabled} variant="outline">
                {children}
            </Button>
            <Button disabled={disabled} variant="ghost">
                {children}
            </Button>
            <Button disabled={disabled} variant="link">
                {children}
            </Button>
            <Button disabled={disabled} variant="ghost" size="icon">
                <ZapIcon size={16} strokeWidth={1.25} />
            </Button>
            <Button disabled={disabled} variant="primaryRoundedIcon">
                <ZapIcon size={16} strokeWidth={0} fill="currentColor" />
            </Button>
            <Button disabled={disabled} variant="outlineRoundedIcon">
                <ZapIcon size={16} strokeWidth={1.25} />
            </Button>
            <Button disabled={disabled} variant="ghostRoundedIcon">
                <ZapIcon size={16} strokeWidth={1.25} />
            </Button>
        </div>
    ),
}
