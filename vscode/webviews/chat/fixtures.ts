import { URI } from 'vscode-uri'

import { type ChatMessage, ps } from '@sourcegraph/cody-shared'
import type { UserAccountInfo } from '../Chat'
import { FILE_MENTION_EDITOR_STATE_FIXTURE } from '../promptEditor/fixtures'

export const FIXTURE_TRANSCRIPT: Record<
    'simple' | 'simple2' | 'codeQuestion' | 'explainCode' | 'explainCode2',
    ChatMessage[]
> = {
    simple: [
        { speaker: 'human', text: ps`Hello, world!` },
        { speaker: 'assistant', text: ps`Thank you` },
    ],
    simple2: [
        {
            speaker: 'human',
            text: ps`What planet are we on?`,
        },
        {
            speaker: 'assistant',
            text: ps`Earth`,
        },
        {
            speaker: 'human',
            text: ps`What color is the sky?`,
            contextFiles: [{ type: 'file', uri: URI.file('/foo.js') }],
        },
        {
            speaker: 'assistant',
            text: ps`Blue.`,
        },
    ],
    codeQuestion: [
        {
            speaker: 'human',
            text: ps`What does \`document.getSelection()?.isCollapsed\` mean? I am trying to use it in a web application that has a textarea and want to manage the user selection.`,
        },
        {
            speaker: 'assistant',
            text: ps`\`document.getSelection()?.isCollapsed\` means that the current selection in the document is collapsed, meaning it is a caret (no text is selected).\n\nThe \`?.\` operator is optional chaining - it will return \`undefined\` if \`document.getSelection()\` returns \`null\` or \`undefined\`.\n\nSo in short, that line is checking if there is currently a text selection in the document, and if not, focusing the textarea.\n\n`,
        },
    ],
    explainCode: [
        {
            speaker: 'human',
            text: ps`Explain the following code at a high level:\n\n\`\`\`\nprivate getNonce(): string {\n  let text = ''\n  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'\n  for (let i = 0; i < 32; i++) {\n    text += possible.charAt(Math.floor(Math.random() * possible.length))\n  }\n  return text\n}\n\`\`\``,
            contextFiles: [
                {
                    type: 'file',
                    uri: URI.file('/vscode/src/chat/ChatViewProvider.ts'),
                },
                { type: 'file', uri: URI.file('/lib/shared/src/timestamp.ts') },
                {
                    type: 'file',
                    uri: URI.file(
                        '/vscode/src/contrib/platform/common/ui/providers/chat/ChatViewProvider.ts'
                    ),
                },
            ],
        },
        {
            speaker: 'assistant',
            text: ps`This code generates a random 32-character string (nonce) using characters A-Z, a-z, and 0-9.`,
        },
        {
            speaker: 'human',
            text: ps`Rewrite it to only use hexadecimal encoding.`,
        },
        {
            speaker: 'assistant',
            text: ps`Here is the rewritten code using only hexadecimal encoding:\n\n\`\`\`\nprivate getNonce(): string {\n  let text = ''\n  const possible = '0123456789ABCDEF'\n  for (let i = 0; i < 32; i++) {\n    text += possible.charAt(Math.floor(Math.random() * possible.length))\n  }\n  return text\n}\n\`\`\``,
        },
    ],
    explainCode2: [
        {
            speaker: 'human',
            text: ps`What does @#Symbol1 in @dir/dir/file-a-1.py do? Also use @README.md:2-8.`,
            editorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
            contextFiles: [
                {
                    type: 'symbol',
                    uri: URI.file('dir/dir/file-a-1.py'),
                    symbolName: 'Symbol1',
                    kind: 'function',
                    range: { start: { line: 1, character: 0 }, end: { line: 8, character: 0 } },
                },
                { type: 'file', uri: URI.file('dir/dir/file-a-1.py') },
                {
                    type: 'file',
                    uri: URI.file('README.md'),
                    range: { start: { line: 1, character: 0 }, end: { line: 8, character: 0 } },
                },
            ],
        },
        {
            speaker: 'assistant',
            text: ps`This code is very cool.`,
        },
    ],
}

export const FIXTURE_USER_ACCOUNT_INFO: UserAccountInfo = {
    isCodyProUser: true,
    isDotComUser: true,
    user: {
        username: 'sqs',
        displayName: 'Quinn Slack',
        avatarURL: 'https://avatars.githubusercontent.com/u/1976',
    },
}
