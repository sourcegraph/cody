import type { Meta, StoryObj } from '@storybook/react'
import { type FunctionComponent, useRef } from 'react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { ScrollDown } from './ScrollDown'

const ScrollDownContainer: FunctionComponent = () => {
    const paragraph = 'Aaa bbb ccc ddd eee fff ggg.'
    const ref = useRef<HTMLDivElement>(null)
    return (
        <div>
            <div ref={ref} style={{ maxHeight: '300px', overflow: 'auto', position: 'relative' }}>
                {new Array(20).fill(0).map((_, index) => {
                    return (
                        // biome-ignore lint/suspicious/noArrayIndexKey:
                        <p key={index} className="tw-mb-4">
                            {paragraph} {paragraph} {paragraph}
                            {paragraph} {paragraph} {paragraph}
                            {paragraph} {paragraph} {paragraph}
                        </p>
                    )
                })}
                <ScrollDown scrollContainerRef={ref} />
            </div>
        </div>
    )
}

const meta: Meta<typeof ScrollDown> = {
    title: 'ui/ScrollDown',
    component: ScrollDown,
    decorators: [VSCodeStandaloneComponent],
    render: () => <ScrollDownContainer />,
}

export default meta

type Story = StoryObj<typeof ScrollDown>

export const Default: Story = {}
