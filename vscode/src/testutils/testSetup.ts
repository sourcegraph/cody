import { beforeAll } from 'vitest'
import { URI } from 'vscode-uri'

import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'

beforeAll(() => {
    const isWin = isWindows()
    setDisplayPathEnvInfo({ isWindows: isWin, workspaceFolders: [isWin ? URI.file('C:\\') : URI.file('/')] })
})
