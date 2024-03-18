import type { SerializedLexicalNode } from 'lexical'
import type { SerializedPromptEditorState } from './PromptEditor'

export const FILE_MENTION_EDITOR_STATE_FIXTURE: SerializedPromptEditorState = {
    v: 'lexical-v0',
    lexicalEditorState: {
        root: {
            children: [
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'What does ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: '@#Symbol1',
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'symbol',
                                uri: 'file:///a/b/file1.go',
                                range: {
                                    start: {
                                        line: 2,
                                        character: 13,
                                    },
                                    end: {
                                        line: 4,
                                        character: 1,
                                    },
                                },
                                symbolName: 'Symbol1',
                                kind: 'function',
                            },
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: ' in ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: '@dir/dir/file-a-1.py',
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///dir/dir/file-a-1.py',
                            },
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: ' do? Also use ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: '@README.md:2-8',
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///dir/dir/file-a-1.py',
                                range: {
                                    start: {
                                        line: 1,
                                        character: 0,
                                    },
                                    end: {
                                        line: 8,
                                        character: 0,
                                    },
                                },
                            },
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: '.',
                            type: 'text',
                            version: 1,
                        },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                } as SerializedLexicalNode,
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    },
    html: '<p class="_theme-paragraph_14phi_48" dir="ltr"><span style="white-space: pre-wrap;">What does </span><span data-lexical-context-item-mention="{&quot;type&quot;:&quot;symbol&quot;,&quot;uri&quot;:&quot;file:///a/b/file1.go&quot;,&quot;range&quot;:{&quot;start&quot;:{&quot;line&quot;:2,&quot;character&quot;:13},&quot;end&quot;:{&quot;line&quot;:4,&quot;character&quot;:1}},&quot;symbolName&quot;:&quot;Symbol1&quot;,&quot;kind&quot;:&quot;function&quot;}" class="context-item-mention-node _context-item-mention-node_h43t3_1"><a href="command:_cody.vscode.open?%5B%7B%22%24mid%22%3A1%2C%22path%22%3A%22%2Fa%2Fb%2Ffile1.go%22%2C%22scheme%22%3A%22file%22%7D%2C%7B%22selection%22%3A%7B%22start%22%3A%7B%22line%22%3A2%2C%22character%22%3A13%7D%2C%22end%22%3A%7B%22line%22%3A4%2C%22character%22%3A1%7D%7D%2C%22preserveFocus%22%3Atrue%2C%22background%22%3Afalse%2C%22preview%22%3Atrue%2C%22viewColumn%22%3A-2%7D%5D">@#Symbol1</a></span><span style="white-space: pre-wrap;"> in </span><span data-lexical-context-item-mention="{&quot;type&quot;:&quot;file&quot;,&quot;uri&quot;:&quot;file:///dir/dir/file-a-1.py&quot;}" class="context-item-mention-node _context-item-mention-node_h43t3_1"><a href="command:_cody.vscode.open?%5B%7B%22%24mid%22%3A1%2C%22path%22%3A%22%2Fdir%2Fdir%2Ffile-a-1.py%22%2C%22scheme%22%3A%22file%22%7D%2C%7B%22preserveFocus%22%3Atrue%2C%22background%22%3Afalse%2C%22preview%22%3Atrue%2C%22viewColumn%22%3A-2%7D%5D">@dir/dir/file-a-1.py</a></span><span style="white-space: pre-wrap;"> do? Also use </span><span data-lexical-context-item-mention="{&quot;type&quot;:&quot;file&quot;,&quot;uri&quot;:&quot;file:///dir/dir/file-a-1.py&quot;,&quot;range&quot;:{&quot;start&quot;:{&quot;line&quot;:1,&quot;character&quot;:0},&quot;end&quot;:{&quot;line&quot;:8,&quot;character&quot;:0}}}" class="context-item-mention-node _context-item-mention-node_h43t3_1"><a href="command:_cody.vscode.open?%5B%7B%22%24mid%22%3A1%2C%22path%22%3A%22%2Fdir%2Fdir%2Ffile-a-1.py%22%2C%22scheme%22%3A%22file%22%7D%2C%7B%22selection%22%3A%7B%22start%22%3A%7B%22line%22%3A1%2C%22character%22%3A0%7D%2C%22end%22%3A%7B%22line%22%3A8%2C%22character%22%3A0%7D%7D%2C%22preserveFocus%22%3Atrue%2C%22background%22%3Afalse%2C%22preview%22%3Atrue%2C%22viewColumn%22%3A-2%7D%5D">@README.md:2-8</a></span><span style="white-space: pre-wrap;">.</span></p>',
}
