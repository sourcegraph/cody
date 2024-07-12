import { type PromptString, ps } from '@sourcegraph/cody-shared'

export interface LanguageConfig {
    blockStart: string
    blockElseTest: RegExp
    blockEnd: string | null
    commentStart: PromptString
}

export function getLanguageConfig(languageId: string): LanguageConfig | null {
    switch (languageId) {
        case 'astro':
        case 'c':
        case 'cpp':
        case 'csharp':
        case 'dart':
        case 'go':
        case 'java':
        case 'javascript':
        case 'javascriptreact':
        case 'kotlin':
        case 'php':
        case 'rust':
        case 'svelte':
        case 'typescript':
        case 'typescriptreact':
        case 'vue':
            return {
                blockStart: '{',
                blockElseTest: /^[\t ]*} else/,
                blockEnd: '}',
                commentStart: ps`// `,
            }
        case 'python': {
            return {
                blockStart: ':',
                blockElseTest: /^[\t ]*(elif |else:)/,
                blockEnd: null,
                commentStart: ps`# `,
            }
        }
        case 'elixir': {
            return {
                blockStart: 'do',
                blockElseTest: /^[\t ]*(else|else do)/,
                blockEnd: 'end',
                commentStart: ps`# `,
            }
        }
        default:
            return null
    }
}
