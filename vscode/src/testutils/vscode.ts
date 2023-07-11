import { vi } from 'vitest'

import { vsCodeMocks } from './mocks'

/**
 * Apply the default VSCode mocks to the global scope.
 */
vi.mock('vscode', () => vsCodeMocks)
