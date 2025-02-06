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
                border: 'var(--border)',
                ring: 'var(--border-active)',
                background: 'var(--background-01)',
                foreground: 'var(--text)',
                input: {
                    foreground: 'var(--text)',
                    background: 'var(--background-02)',
                    border: 'var(--vscode-input-border)',
                },
                button: {
                    background: {
                        DEFAULT: 'var(--button-primary-background)',
                        hover: 'var(--button-primary-background-hover)',
                    },
                    foreground: 'var(--button-primary-text)',
                    border: 'var(--border-active, transparent)',
                    secondary: {
                        background: {
                            DEFAULT: 'var(--button-secondary-background)',
                            hover: 'var(--button-secondary-background-hover)',
                        },
                        foreground: 'var(--button-secondary-text)',
                    },
                },
                sidebar: {
                    background: 'var(--background-01)',
                    foreground: 'var(--text)',
                },
                muted: {
                    DEFAULT: 'var(--background-03)',
                    transparent: 'color-mix(in lch, currentColor 10%, transparent)',
                    foreground: 'var(--text-muted)',
                },
                accent: {
                    DEFAULT: 'var(--highlight-background)',
                    foreground: 'var(--highlight-text)',
                },
                popover: {
                    DEFAULT: 'var(--background-03)',
                    foreground: 'var(--text)',
                },
                keybinding: {
                    foreground: 'var(--text-muted)',
                    background: 'var(--background-03)',
                    border: 'var(--border-subtle)',
                },
                link: {
                    DEFAULT: 'var(--link-color)',
                    hover: 'var(--link-hover-color)',
                },
                current: {
                    DEFAULT: 'currentColor',
                    25: 'color-mix(in lch, currentColor 25%, transparent)',
                },
                badge: {
                    border: 'var(--highlight-border)',
                    foreground: 'var(--text-inverted)',
                    background: 'var(--link-color)',
                },
                'status-offline': {
                    background: 'var(--vscode-statusBarItem-offlineBackground)',
                    foreground: 'var(--vscode-statusBarItem-offlineForeground)',
                },
                sourcegraph: {
                    blue: '#00CBEC',
                    purple: '#A112FF',
                    orange: '#FF5543',
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
