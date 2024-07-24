import type { SerializedLexicalNode, SerializedTextNode } from 'lexical'
import type { SerializedPromptEditorState } from './editorState'
import type {
    SerializedContextItem,
    SerializedContextItemMentionNode,
    SerializedTemplateInputNode,
} from './nodes'

export const FILE_MENTION_EDITOR_STATE_FIXTURE: SerializedPromptEditorState = {
    v: 'lexical-v0',
    minReaderV: 'lexical-v0',
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
                            isFromInitialContext: false,
                            text: 'Symbol1',
                        } satisfies SerializedContextItemMentionNode,
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
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///dir/dir/file-a-1.py',
                            },
                            isFromInitialContext: false,
                            text: 'file-a-1.py',
                        } satisfies SerializedContextItemMentionNode,
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
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///dir/dir/README.md',
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
                            isFromInitialContext: false,
                            text: 'README.md:2-8',
                        } satisfies SerializedContextItemMentionNode,
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
}

export const GENERATE_UNIT_TEST_EDITOR_STATE_FIXTURE: SerializedPromptEditorState = {
    v: 'lexical-v1',
    minReaderV: 'lexical-v1',
    lexicalEditorState: {
        root: {
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
            children: [
                {
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            type: 'text',
                            version: 1,
                            text: 'Your task is to generate a suit of multiple unit tests for the functions defined inside the ',
                        },
                        {
                            type: 'contextItemMention',
                            contextItem: {
                                type: 'file',
                                uri: 'file:///a/b/file1.go',
                                source: 'user',
                            },
                            text: 'file1.go',
                            isFromInitialContext: false,
                            version: 1,
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            type: 'text',
                            version: 1,
                            text: ' file.\n\nUse the ',
                        },
                        {
                            type: 'templateInput',
                            templateInput: {
                                placeholder: 'mention the testing framework',
                            },
                            version: 1,
                        } satisfies SerializedTemplateInputNode,
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            type: 'text',
                            version: 1,
                            text: ' framework to generate the unit tests. Follow the example tests from the ',
                        },
                        {
                            type: 'templateInput',
                            templateInput: {
                                placeholder: 'mention an example test file',
                            },
                            version: 1,
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            type: 'text',
                            version: 1,
                            text: ' test file. Include unit tests for the following cases: ',
                        },
                        {
                            type: 'templateInput',
                            templateInput: {
                                placeholder: 'list test cases',
                            },
                            version: 1,
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            type: 'text',
                            version: 1,
                            text: '.\n\nEnsure that the unit tests cover all the edge cases and validate the expected functionality of the functions',
                        },
                    ],
                } as SerializedLexicalNode,
            ],
        },
    },
}

/**
 * An editor state fixture of the old text (not chip) mentions, where the mentions are Lexical
 * TextNode subclasses instead of Lexical DecoratorNode subclasses. This format's mention TextNodes
 * should be seamlessly interpreted as DecoratorNodes due to sharing the same `type` name.
 */
export const OLD_TEXT_FILE_MENTION_EDITOR_STATE_FIXTURE: SerializedPromptEditorState = {
    v: 'lexical-v0',
    minReaderV: 'lexical-v0',
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
                            text: '@Symbol1',
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
                            isFromInitialContext: false,
                        } satisfies SerializedTextNode & {
                            contextItem: SerializedContextItem
                            isFromInitialContext: boolean
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
                            text: '@file-a-1.py',
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///dir/dir/file-a-1.py',
                            },
                            isFromInitialContext: false,
                        } satisfies SerializedTextNode & {
                            contextItem: SerializedContextItem
                            isFromInitialContext: boolean
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
                                uri: 'file:///dir/dir/README.md',
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
                            isFromInitialContext: false,
                        } satisfies SerializedTextNode & {
                            contextItem: SerializedContextItem
                            isFromInitialContext: boolean
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
}

// NOTE(sqs): This is not used and will cause an error when Lexical parses it. It can be used during
// dev to trigger this error condition. There is not a good way to handle this case within Lexical
// itself; we need to avoid this case by using minReaderV checks.
export const UNKNOWN_NODES_EDITOR_STATE_FIXTURE: SerializedPromptEditorState = {
    v: 'lexical-v0',
    minReaderV: 'lexical-v0',
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
                            text: 'What is ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            type: 'unknownNode',
                            version: 1,
                            foo: 'bar',

                            // The unknownNode has `text`, which makes it backwards compatible.
                            // Unrecognized nodes are treated as text nodes.
                            text: 'unknown-node-content-foo',
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
}
