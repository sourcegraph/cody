import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { FileContentSearchResult } from './CodeSnippet'

const meta: Meta<typeof FileContentSearchResult> = {
    title: 'cody/FileContentSearchResult',
    component: FileContentSearchResult,
    decorators: [story => <div style={{ padding: 20 }}> {story()} </div>, VSCodeStandaloneComponent],
    args: {
        allExpanded: false,
        defaultExpanded: undefined,
        repoDisplayName: 'microsoft/vscode',
        showAllMatches: false,
        result: {
            chunkMatches: [
                {
                    content: '\nclass SnippetBodyInsights {\n\n',
                    contentStart: {
                        offset: 1492,
                        line: 19,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 1510,
                                line: 20,
                                column: 17,
                            },
                            end: {
                                offset: 1517,
                                line: 20,
                                column: 24,
                            },
                        },
                    ],
                },
                {
                    content:
                        '\n\tprivate readonly _bodyInsights: WindowIdleValue<SnippetBodyInsights>;\n\n',
                    contentStart: {
                        offset: 3909,
                        line: 101,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 3933,
                                line: 102,
                                column: 23,
                            },
                            end: {
                                offset: 3940,
                                line: 102,
                                column: 30,
                            },
                        },
                        {
                            start: {
                                offset: 3970,
                                line: 102,
                                column: 60,
                            },
                            end: {
                                offset: 3977,
                                line: 102,
                                column: 67,
                            },
                        },
                    ],
                },
                {
                    content:
                        '\t\tthis.prefixLow = prefix.toLowerCase();\n\t\tthis._bodyInsights = new WindowIdleValue(getActiveWindow(), () => new SnippetBodyInsights(this.body));\n\t}\n',
                    contentStart: {
                        offset: 4357,
                        line: 118,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 4410,
                                line: 119,
                                column: 12,
                            },
                            end: {
                                offset: 4417,
                                line: 119,
                                column: 19,
                            },
                        },
                        {
                            start: {
                                offset: 4481,
                                line: 119,
                                column: 83,
                            },
                            end: {
                                offset: 4488,
                                line: 119,
                                column: 90,
                            },
                        },
                    ],
                },
                {
                    content:
                        '\tget codeSnippet(): string {\n\t\treturn this._bodyInsights.value.codeSnippet;\n\t}\n',
                    contentStart: {
                        offset: 4507,
                        line: 122,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 4555,
                                line: 123,
                                column: 19,
                            },
                            end: {
                                offset: 4562,
                                line: 123,
                                column: 26,
                            },
                        },
                    ],
                },
                {
                    content:
                        '\tget isBogous(): boolean {\n\t\treturn this._bodyInsights.value.isBogous;\n\t}\n',
                    contentStart: {
                        offset: 4587,
                        line: 126,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 4633,
                                line: 127,
                                column: 19,
                            },
                            end: {
                                offset: 4640,
                                line: 127,
                                column: 26,
                            },
                        },
                    ],
                },
                {
                    content:
                        '\tget isTrivial(): boolean {\n\t\treturn this._bodyInsights.value.isTrivial;\n\t}\n',
                    contentStart: {
                        offset: 4662,
                        line: 130,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 4709,
                                line: 131,
                                column: 19,
                            },
                            end: {
                                offset: 4716,
                                line: 131,
                                column: 26,
                            },
                        },
                    ],
                },
                {
                    content:
                        '\tget needsClipboard(): boolean {\n\t\treturn this._bodyInsights.value.usesClipboardVariable;\n\t}\n',
                    contentStart: {
                        offset: 4739,
                        line: 134,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 4791,
                                line: 135,
                                column: 19,
                            },
                            end: {
                                offset: 4798,
                                line: 135,
                                column: 26,
                            },
                        },
                    ],
                },
                {
                    content:
                        '\tget usesSelection(): boolean {\n\t\treturn this._bodyInsights.value.usesSelectionVariable;\n\t}\n',
                    contentStart: {
                        offset: 4833,
                        line: 138,
                        column: 0,
                    },
                    ranges: [
                        {
                            start: {
                                offset: 4884,
                                line: 139,
                                column: 19,
                            },
                            end: {
                                offset: 4891,
                                line: 139,
                                column: 26,
                            },
                        },
                    ],
                },
            ],
            branches: [''],
            commit: '90501335849147dda27da6b94372ac31de63f718',
            language: 'TypeScript',
            path: 'src/vs/workbench/contrib/snippets/browser/snippetsFile.ts',
            repoLastFetched: '2024-09-10T03:19:51.107336Z',
            repoStars: 162299,
            repository: 'github.com/microsoft/vscode',
            type: 'content',
        },
        onSelect: () => {},
    },
}

export default meta

type Story = StoryObj<typeof FileContentSearchResult>

export const PlainText: Story = {
    args: {},
}

export const Highlighted: Story = {
    args: {
        fetchHighlightedFileLineRanges: () =>
            Promise.resolve([
                [
                    '<tr><td class="line" data-line="20"></td><td class="code"><span>\n</span></td></tr>',
                    '<tr><td class="line" data-line="21"></td><td class="code"><span class="hl-typed-Keyword">class</span><span> </span><span class="hl-typed-IdentifierType">SnippetBodyInsights</span><span> {</span></td></tr>',
                    '<tr><td class="line" data-line="22"></td><td class="code"><span>\n</span></td></tr>',
                ],
                [
                    '<tr><td class="line" data-line="102"></td><td class="code"><span>\n</span></td></tr>',
                    '<tr><td class="line" data-line="103"></td><td class="code"><span>\t</span><span class="hl-typed-Keyword">private</span><span> </span><span class="hl-typed-Keyword">readonly</span><span> </span><span class="hl-typed-Identifier">_bodyInsights</span><span>: </span><span class="hl-typed-IdentifierType">WindowIdleValue</span><span>&lt;</span><span class="hl-typed-IdentifierType">SnippetBodyInsights</span><span>&gt;;</span></td></tr>',
                    '<tr><td class="line" data-line="104"></td><td class="code"><span>\n</span></td></tr>',
                ],
                [
                    '<tr><td class="line" data-line="119"></td><td class="code"><span>\t\t</span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">prefixLow</span><span> = </span><span class="hl-typed-Identifier">prefix</span><span>.</span><span class="hl-typed-IdentifierFunction">toLowerCase</span><span>();</span></td></tr>',
                    '<tr><td class="line" data-line="120"></td><td class="code"><span>\t\t</span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">_bodyInsights</span><span> = </span><span class="hl-typed-Keyword">new</span><span> </span><span class="hl-typed-Identifier">WindowIdleValue</span><span>(</span><span class="hl-typed-IdentifierFunction">getActiveWindow</span><span>(), () =&gt; </span><span class="hl-typed-Keyword">new</span><span> </span><span class="hl-typed-Identifier">SnippetBodyInsights</span><span>(</span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">body</span><span>));</span></td></tr>',
                    '<tr><td class="line" data-line="121"></td><td class="code"><span>\t}</span></td></tr>',
                ],
                [
                    '<tr><td class="line" data-line="123"></td><td class="code"><span>\t</span><span class="hl-typed-Keyword">get</span><span> </span><span class="hl-typed-IdentifierFunction">codeSnippet</span><span>(): </span><span class="hl-typed-IdentifierBuiltinType">string</span><span> {</span></td></tr>',
                    '<tr><td class="line" data-line="124"></td><td class="code"><span>\t\t</span><span class="hl-typed-Keyword">return</span><span> </span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">_bodyInsights</span><span>.</span><span class="hl-typed-Identifier">value</span><span>.</span><span class="hl-typed-Identifier">codeSnippet</span><span>;</span></td></tr>',
                    '<tr><td class="line" data-line="125"></td><td class="code"><span>\t}</span></td></tr>',
                ],
                [
                    '<tr><td class="line" data-line="127"></td><td class="code"><span>\t</span><span class="hl-typed-Keyword">get</span><span> </span><span class="hl-typed-IdentifierFunction">isBogous</span><span>(): </span><span class="hl-typed-IdentifierBuiltinType">boolean</span><span> {</span></td></tr>',
                    '<tr><td class="line" data-line="128"></td><td class="code"><span>\t\t</span><span class="hl-typed-Keyword">return</span><span> </span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">_bodyInsights</span><span>.</span><span class="hl-typed-Identifier">value</span><span>.</span><span class="hl-typed-Identifier">isBogous</span><span>;</span></td></tr>',
                    '<tr><td class="line" data-line="129"></td><td class="code"><span>\t}</span></td></tr>',
                ],
                [
                    '<tr><td class="line" data-line="131"></td><td class="code"><span>\t</span><span class="hl-typed-Keyword">get</span><span> </span><span class="hl-typed-IdentifierFunction">isTrivial</span><span>(): </span><span class="hl-typed-IdentifierBuiltinType">boolean</span><span> {</span></td></tr>',
                    '<tr><td class="line" data-line="132"></td><td class="code"><span>\t\t</span><span class="hl-typed-Keyword">return</span><span> </span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">_bodyInsights</span><span>.</span><span class="hl-typed-Identifier">value</span><span>.</span><span class="hl-typed-Identifier">isTrivial</span><span>;</span></td></tr>',
                    '<tr><td class="line" data-line="133"></td><td class="code"><span>\t}</span></td></tr>',
                ],
                [
                    '<tr><td class="line" data-line="135"></td><td class="code"><span>\t</span><span class="hl-typed-Keyword">get</span><span> </span><span class="hl-typed-IdentifierFunction">needsClipboard</span><span>(): </span><span class="hl-typed-IdentifierBuiltinType">boolean</span><span> {</span></td></tr>',
                    '<tr><td class="line" data-line="136"></td><td class="code"><span>\t\t</span><span class="hl-typed-Keyword">return</span><span> </span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">_bodyInsights</span><span>.</span><span class="hl-typed-Identifier">value</span><span>.</span><span class="hl-typed-Identifier">usesClipboardVariable</span><span>;</span></td></tr>',
                    '<tr><td class="line" data-line="137"></td><td class="code"><span>\t}</span></td></tr>',
                ],
                [
                    '<tr><td class="line" data-line="139"></td><td class="code"><span>\t</span><span class="hl-typed-Keyword">get</span><span> </span><span class="hl-typed-IdentifierFunction">usesSelection</span><span>(): </span><span class="hl-typed-IdentifierBuiltinType">boolean</span><span> {</span></td></tr>',
                    '<tr><td class="line" data-line="140"></td><td class="code"><span>\t\t</span><span class="hl-typed-Keyword">return</span><span> </span><span class="hl-typed-IdentifierBuiltin">this</span><span>.</span><span class="hl-typed-Identifier">_bodyInsights</span><span>.</span><span class="hl-typed-Identifier">value</span><span>.</span><span class="hl-typed-Identifier">usesSelectionVariable</span><span>;</span></td></tr>',
                    '<tr><td class="line" data-line="141"></td><td class="code"><span>\t}</span></td></tr>',
                ],
            ]),
    },
}
