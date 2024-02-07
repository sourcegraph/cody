interface LanguageConfig {
    blockStart: string
    blockElseTest: RegExp
    blockEnd: string | null
    commentStart: string
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
                commentStart: '// ',
            }
        case 'python': {
            return {
                blockStart: ':',
                blockElseTest: /^[\t ]*(elif |else:)/,
                blockEnd: null,
                commentStart: '# ',
            }
        }
        case 'elixir': {
            return {
                blockStart: 'do',
                blockElseTest: /^[\t ]*(else|else do)/,
                blockEnd: 'end',
                commentStart: '#',
            }
        }
        default:
            return null
    }
}
