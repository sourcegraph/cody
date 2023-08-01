interface LanguageConfig {
    blockStart: string
    blockElseTest: RegExp
    blockEnd: string | null
    commentStart: string
}

export function getLanguageConfig(languageId: string): LanguageConfig | null {
    switch (languageId) {
        case 'c':
        case 'cpp':
        case 'csharp':
        case 'go':
        case 'java':
        case 'javascript':
        case 'javascriptreact':
        case 'typescript':
        case 'typescriptreact':
        case 'php':
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
        default:
            return null
    }
}
