/** @type {import('tailwindcss').Config} */

const plugin = require('tailwindcss/plugin')

export default {
    content: {
        relative: true,
        files: ['**/*.{ts,tsx}', '../../lib/**/**/*.{ts,tsx}'],
    },
    prefix: 'tw-',
    theme: {
        extend: {
            fontSize: {
                lg: 'calc(var(--vscode-font-size) * 15 / 13)', // = 15px
                md: 'var(--vscode-font-size)', // = 13px
                sm: 'calc(calc(12/13)*var(--vscode-font-size))', // = 12px
                xs: 'calc(calc(11/13)*var(--vscode-font-size))', // = 11px
                xxs: 'calc(calc(10/13)*var(--vscode-font-size))', // = 10px
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
                12: '24px',
                14: '28px',
                16: '32px',
                18: '36px',
                20: '40px',
                21: '44px',
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
                button: {
                    background: {
                        DEFAULT: 'var(--vscode-button-background)',
                        hover: 'var(--vscode-button-hoverBackground)',
                    },
                    foreground: 'var(--vscode-button-foreground)',
                    border: 'var(--vscode-button-border, transparent)',
                    secondary: {
                        background: {
                            DEFAULT: 'var(--vscode-button-secondaryBackground)',
                            hover: 'var(--vscode-button-secondaryHoverBackground)',
                        },
                        foreground: 'var(--vscode-button-secondaryForeground)',
                    },
                },
                muted: {
                    DEFAULT: 'var(--vscode-input-background)',
                    transparent: 'color-mix(in lch, currentColor 15%, transparent)',
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
                    hover: 'var(--vscode-textLink-activeForeground)',
                },
                current: {
                    DEFAULT: 'currentColor',
                    25: 'color-mix(in lch, currentColor 25%, transparent)',
                },
                badge: {
                    border: 'var(--vscode-contrastBorder)',
                    foreground: 'var(--vscode-badge-foreground)',
                    background: 'var(--vscode-badge-background)',
                },
                'status-offline': {
                    background: 'var(--vscode-statusBarItem-offlineBackground)',
                    foreground: 'var(--vscode-statusBarItem-offlineForeground)',
                },
            },
            borderRadius: {
                lg: '6px',
                md: '4px',
                sm: '2px',
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' },
                },
                'collapsible-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-collapsible-content-height)' },
                },
                'collapsible-up': {
                    from: { height: 'var(--radix-collapsible-content-height)' },
                    to: { height: '0' },
                },
            },
            animation: {
                'accordion-down': 'accordion-down 0.15s ease-out',
                'accordion-up': 'accordion-up 0.15s ease-out',
                'collapsible-down': 'collapsible-down 0.15s ease-out',
                'collapsible-up': 'collapsible-up 0.15s ease-out',
            },
        },
    },
    plugins: [
        plugin(({ addVariant }) => {
            // Allows use to customize styling for VS Code light and dark themes
            addVariant('high-contrast-dark', 'body[data-vscode-theme-kind="vscode-high-contrast"] &')
            addVariant(
                'high-contrast-light',
                'body[data-vscode-theme-kind="vscode-high-contrast-light"] &'
            )
        }),
    ],
}
