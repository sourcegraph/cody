import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock(
    '@vscode/webview-ui-toolkit/react',
    () =>
        ({
            VSCodeButton: 'VSCodeButton',
            VSCodeBadge: 'VSCodeBadge',
        }) satisfies Partial<Record<keyof typeof import('@vscode/webview-ui-toolkit/react'), string>>
)

class MockIntersectionObserver {
    observe() {}
    disconnect() {}
}
global.IntersectionObserver = MockIntersectionObserver as any

afterEach(() => {
    cleanup()
})
