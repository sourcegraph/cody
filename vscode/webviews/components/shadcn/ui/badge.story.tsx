import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../../../vscode/webviews/storybook/VSCodeStoryDecorator'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
    title: 'ui/Badge',
    component: Badge,

    argTypes: {
        children: {
            control: { type: 'text' },
        },
    },

    decorators: [VSCodeStandaloneComponent, Story => <div className="tw-p-6">{Story()}</div>],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    argTypes: {
        variant: {
            control: { type: 'radio' },
            options: ['secondary'],
        },
    },

    args: {
        children: 'Badge',
    },

    render: ({ variant, children }) => <Badge variant={variant}>{children}</Badge>,
}
