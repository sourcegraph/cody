/** @type {import('tailwindcss').Config} */
export default {
    content: {
        relative: true,
        files: ['**/*.{ts,tsx}'],
    },
    prefix: 'tw-',
    theme: {
        extend: {
            fontSize: {
                lg: 'calc(1.1*var(--vscode-font-size))',
                md: 'var(--vscode-font-size)',
                sm: 'calc(0.9*var(--vscode-font-size))',
                xs: 'calc(0.85*var(--vscode-font-size))',
            },
            fontFamily: {
                codyicons: ['cody-icons'],
            },
            spacing: {
                1: '2px',
                1.5: '3px',
                2: '4px',
                3: '6px',
                4: '8px',
                5: '10px',
                6: '12px',
                8: '16px',
                10: '20px',
                11: '22px',
                16: '32px',
            },
            border: {
                DEFAULT: '1px',
            },
            colors: {
                border: 'var(--vscode-dropdown-border)',
                input: 'var(--vscode-input-background)',
                ring: 'var(--vscode-focusBorder)',
                background: 'var(--vscode-editor-background)',
                foreground: 'var(--vscode-foreground)',
                primary: {
                    DEFAULT: 'var(--vscode-button-background)',
                    foreground: 'var(--vscode-button-foreground)',
                },
                secondary: {
                    DEFAULT: 'var(--vscode-button-secondaryBackground)',
                    foreground: 'var(--vscode-button-secondaryForeground)',
                },
                muted: {
                    DEFAULT: 'var(--vscode-input-background)',
                    transparent: 'color-mix(in lch, var(--vscode-input-background) 25%, transparent)',
                    foreground: 'var(--vscode-input-placeholderForeground)',
                },
                accent: {
                    DEFAULT: 'var(--vscode-list-activeSelectionBackground)',
                    foreground: 'var(--vscode-list-activeSelectionForeground)',
                },
                popover: {
                    DEFAULT: 'var(--vscode-quickInput-background)',
                    foreground: 'var(--vscode-dropdown-foreground)',
                },
                keybinding: {
                    foreground: 'var(--vscode-keybindingLabel-foreground)',
                    background: 'var(--vscode-keybindingLabel-background)',
                    border: 'var(--vscode-keybindingLabel-border)',
                },
                link: {
                    DEFAULT: 'var(--vscode-textLink-foreground)',
                },
            },
            borderRadius: {
                lg: '6px',
                md: '4px',
                sm: '2px',
            },
        },
    },
}
