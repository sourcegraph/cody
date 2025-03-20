// import { type UIFileView, UIToolStatus } from '@sourcegraph/cody-shared'
// import type { Meta, StoryObj } from '@storybook/react'
// import { URI } from 'vscode-uri'
// import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
// import { FileCell } from './FileCell'

// const meta: Meta<typeof FileCell> = {
//     title: 'agentic/FileCell',
//     component: FileCell,
//     decorators: [VSCodeWebview],
// }
// export default meta

// type Story = StoryObj<typeof FileCell>

// export const Default: Story = {
//     args: {
//         result: {
//             id: 'file-1',
//             name: 'file',
//             type: 'file-view',
//             uri: URI.file('path/to/example.ts'),
//             title: 'path/to/example.ts',
//             content: 'function example() {\n  console.log("Hello, world!");\n  return true;\n}',
//             status: UIToolStatus.Done,
//         } as UIFileView,
//         defaultOpen: true,
//     },
// }

// export const LongFile: Story = {
//     args: {
//         result: {
//             id: 'long-file',
//             name: 'file',
//             type: 'file-view',
//             uri: URI.file('longExample.ts'),
//             title: 'longExample.ts',
//             content: Array(20).fill('// This is a line of code').join('\n'),
//             status: UIToolStatus.Done,
//         } as UIFileView,
//     },
// }

// export const WithCustomClass: Story = {
//     args: {
//         result: {
//             id: 'styled-file',
//             name: 'file',
//             type: 'file-view',
//             uri: URI.file('styled.ts'),
//             title: 'styled.ts',
//             content: 'const styles = {\n  color: "blue",\n  fontSize: 14\n}',
//             status: UIToolStatus.Done,
//         } as UIFileView,
//         className: 'tw-max-w-md',
//     },
// }

// export const Collapsed: Story = {
//     args: {
//         result: {
//             id: 'collapsed-file',
//             name: 'file',
//             type: 'file-view',
//             uri: URI.file('collapsed.ts'),
//             title: 'collapsed.ts',
//             content: 'const hidden = "This content is initially hidden";',
//             status: UIToolStatus.Done,
//         } as UIFileView,
//         defaultOpen: false,
//     },
// }

// export const LongFileName: Story = {
//     args: {
//         result: {
//             id: 'long-filename',
//             name: 'file',
//             type: 'file-view',
//             uri: URI.file('very/long/path/to/some/deeply/nested/component/with/long/name/example.ts'),
//             title: 'very/long/path/to/some/deeply/nested/component/with/long/name/example.ts',
//             content: 'export const Component = () => <div>Example</div>;',
//             status: UIToolStatus.Done,
//         } as UIFileView,
//     },
// }
