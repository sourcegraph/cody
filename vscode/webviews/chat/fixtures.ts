import { URI } from 'vscode-uri'

import {
    type ChatMessage,
    CodyIDE,
    ContextItemSource,
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    ps,
} from '@sourcegraph/cody-shared'
import { GENERATE_UNIT_TEST_EDITOR_STATE_FIXTURE } from '@sourcegraph/cody-shared/src/lexicalEditor/fixtures'
import type { UserAccountInfo } from '../Chat'

export function transcriptFixture(transcript: ChatMessage[]): ChatMessage[] {
    return transcript.map(m => ({
        ...m,
        model: m.model === undefined && m.speaker !== 'human' ? 'my-model' : m.model,
    }))
}

export const FIXTURE_TRANSCRIPT: Record<
    | 'simple'
    | 'simple2'
    | 'codeQuestion'
    | 'explainCode'
    | 'explainCode2'
    | 'experimentalGenerateUnitTest'
    | 'generateCode'
    | 'long'
    | 'empty'
    | 'toolUse',
    ChatMessage[]
> = {
    simple: transcriptFixture([
        { speaker: 'human', text: ps`Hello, world!` },
        { speaker: 'assistant', text: ps`Thank you` },
    ]),
    simple2: transcriptFixture([
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
    ]),
    codeQuestion: transcriptFixture([
        {
            speaker: 'human',
            text: ps`What does \`document.getSelection()?.isCollapsed\` mean? I am trying to use it in a web application that has a textarea and want to manage the user selection.`,
        },
        {
            speaker: 'assistant',
            text: ps`\`document.getSelection()?.isCollapsed\` means that the current selection in the document is collapsed, meaning it is a caret (no text is selected).\n\nThe \`?.\` operator is optional chaining - it will return \`undefined\` if \`document.getSelection()\` returns \`null\` or \`undefined\`.\n\nSo in short, that line is checking if there is currently a text selection in the document, and if not, focusing the textarea.\n\n`,
        },
    ]),
    explainCode: transcriptFixture([
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
    ]),
    explainCode2: transcriptFixture([
        {
            speaker: 'human',
            text: ps`What does Symbol1 in dir/dir/file-a-1.py do? Also use README.md:2-8.`,
            editorState: FILE_MENTION_EDITOR_STATE_FIXTURE,
            contextFiles: [
                {
                    type: 'symbol',
                    uri: URI.file('dir/dir/file-a-1.py'),
                    symbolName: 'Symbol1',
                    kind: 'function',
                    range: { start: { line: 1, character: 0 }, end: { line: 8, character: 0 } },
                },
                { type: 'file', uri: URI.file('dir/dir/file-a-2.py'), source: ContextItemSource.Search },
                {
                    type: 'file',
                    uri: URI.file('README.md'),
                    range: { start: { line: 1, character: 0 }, end: { line: 8, character: 0 } },
                },
                {
                    source: ContextItemSource.Unified,
                    type: 'file',
                    remoteRepositoryName: 'myRepo',
                    repoName: 'myRepo',
                    title: 'README.md',
                    revision: 'main',
                    uri: URI.parse(
                        'https://sourcegraph.sourcegraph.com/github.com/sourcegraph/cody/-/blob/vscode/e2e/issues/CODY-2392.test.ts?L21-43'
                    ),
                    range: { start: { line: 1, character: 0 }, end: { line: 8, character: 0 } },
                },
                {
                    source: ContextItemSource.Unified,
                    type: 'file',
                    remoteRepositoryName: 'myRepo',
                    repoName: 'myRepo',
                    title: 'fooDir/file-c-1.py',
                    revision: 'main',
                    uri: URI.parse(
                        'https://sourcegraph.sourcegraph.com/github.com/sourcegraph/cody/-/blob/vscode/e2e/issues/CODY-2392.test.ts?L21-43'
                    ),
                    range: { start: { line: 1, character: 0 }, end: { line: 8, character: 0 } },
                },
            ],
        },
        {
            speaker: 'assistant',
            text: ps`This code is very cool. Here is some more code:\n\n\n\`\`\`javascript\nfunction Symbol1() {\n  console.log('Hello, world!')\n}\n\`\`\`\n`,
        },
    ]),
    experimentalGenerateUnitTest: transcriptFixture([
        {
            speaker: 'human',
            editorState: GENERATE_UNIT_TEST_EDITOR_STATE_FIXTURE,
            contextFiles: [
                { type: 'file', uri: URI.file('/a/b/file1.py'), source: ContextItemSource.User },
            ],
        },
    ]),
    generateCode: transcriptFixture([
        {
            speaker: 'human',
            text: ps`Generate a hello world in Rust.`,
        },
        {
            speaker: 'assistant',
            text: ps`This code generates a random 32-character string (nonce) using characters <pre><code>fn main() {
    // String type - owned, mutable, heap-allocated
    let mut owned_string = String::from("Hello");

    // &str type - string slice, immutable reference
    let string_literal = "World";

    // Concatenation method 1: Using push_str()
    owned_string.push_str(string_literal);
    println!("Using push_str(): {}", owned_string);

</code></pre> Hopefully that helps.`,
        },
    ]),
    long: transcriptFixture([
        {
            speaker: 'human',
            text: ps`What are some colors?`,
            contextFiles: [{ type: 'file', uri: URI.file('dir/dir/file-a-1.py') }],
        },
        {
            speaker: 'assistant',
            text: ps`Here are some colors:\n\n* Red\n* Green\n* Blue\n* Yellow\n* Cyan\n* Magenta\n* Black\n* White\n`,
        },
        {
            speaker: 'human',
            text: ps`What are some letters?`,
            contextFiles: [{ type: 'file', uri: URI.file('dir/dir/file-a-2.py') }],
        },
        {
            speaker: 'assistant',
            text: ps`Here are some letters:\n\n* A\n* B\n* C\n* D\n* E\n* F\n* G\n* H\n* I\n* J\n* K\n* L\n* M\n* N\n* O\n* P\n* Q\n* R\n* S\n* T\n* U\n* V\n* W\n* X\n* Y\n* Z\n`,
        },
        {
            speaker: 'human',
            text: ps`What are some numbers?`,
            contextFiles: [{ type: 'file', uri: URI.file('dir/dir/file-a-3.py') }],
        },
        {
            speaker: 'assistant',
            text: ps`Here are some numbers:\n\n* 1\n* 2\n* 3\n* 4\n* 5\n* 6\n* 7\n* 8\n* 9\n* 10\n`,
        },
    ]),
    empty: [],
    toolUse: transcriptFixture([
        {
            speaker: 'human',
            text: ps`What does foo.ts do?`,
        },
        {
            speaker: 'assistant',
            subMessages: [
                {
                    text: ps`I will read the file foo.ts.`,
                },
                {
                    step: {
                        id: 'read_file',
                        content: `Invoking tool get_file({"path":"vscode/src/main.ts"})`,
                        state: 'success',
                    },
                },
                {
                    text: ps`According to the contents of the file, foo.ts contains the function bar.`,
                },
            ],
        },
    ]),
}

export const FIXTURE_USER_ACCOUNT_INFO: UserAccountInfo = {
    user: {
        username: 'sqs',
        displayName: 'Quinn Slack',
        avatarURL: 'https://avatars.githubusercontent.com/u/1976',
        endpoint: '',
    },
    IDE: CodyIDE.VSCode,
}
