import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class MockIntersectionObserver {
    observe() {}
    disconnect() {}
}
global.IntersectionObserver = MockIntersectionObserver as any

afterEach(() => {
    cleanup()
})
