import { useArgs } from '@storybook/preview-api'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../../../../storybook/VSCodeStoryDecorator'
import { UploadImageButton } from './UploadImageButton'

const meta: Meta<typeof UploadImageButton> = {
    title: 'ui/UploadImageButton',
    component: UploadImageButton,

    args: {
        imageFile: undefined,
    },

    decorators: [VSCodeStandaloneComponent],
}

export default meta

export const Default: StoryObj<typeof meta> = {
    render: () => {
        const [args, setArgs] = useArgs()
        return (
            <UploadImageButton
                {...args}
                onClick={() => {
                    setArgs({
                        // Toggle between submittable and busy
                        uploadedImageUri: args.uploadedImageUri ? undefined : 'some/image/image.png',
                    })
                }}
            />
        )
    },
}

export const WithImageAttached: StoryObj<typeof meta> = {
    args: {
        imageFile: {
            name: 'some/image/image-with-a-super-super-super-long-path.svg',
        } as File,
    },
}
