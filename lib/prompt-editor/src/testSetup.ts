import '@testing-library/jest-dom/vitest'
import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'
import { URI } from 'vscode-uri'

beforeAll(() => {
    const isWin = isWindows()
    setDisplayPathEnvInfo({
        isWindows: isWin,
        workspaceFolders: [isWin ? URI.file('C:\\') : URI.file('/')],
    })
})

afterEach(() => {
    cleanup()
})
