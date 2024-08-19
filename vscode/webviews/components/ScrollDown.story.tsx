import type { Meta, StoryObj } from '@storybook/react'
import { type FunctionComponent, useState } from 'react'
import { ScrollDown } from './ScrollDown'

const ScrollDownContainer: FunctionComponent = () => {
    const paragraph = 'Aaa bbb ccc ddd eee fff ggg.'
    const [ref, setRef] = useState<HTMLDivElement | null>(null) // use useState to force rerender
    return (
        <>
            <div className="tw-h-[50vh] tw-overflow-auto" ref={e => setRef(e)}>
                {new Array(20).fill(0).map((_, index) => {
                    return (
                        // biome-ignore lint/suspicious/noArrayIndexKey:
                        <p key={index} className="tw-mb-4 tw-max-w-lg">
                            {paragraph} {paragraph} {paragraph}
                            {paragraph} {paragraph} {paragraph}
                            {paragraph} {paragraph} {paragraph}
                        </p>
                    )
                })}
                {ref && <ScrollDown scrollableParent={ref} />}
            </div>
        </>
    )
}

const meta: Meta<typeof ScrollDown> = {
    title: 'ui/ScrollDown',
    component: ScrollDown,
    decorators: [],
    render: () => <ScrollDownContainer />,
}

export default meta

type Story = StoryObj<typeof ScrollDown>

export const Default: Story = {}
