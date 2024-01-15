import { beforeAll } from 'vitest'
import { URI } from 'vscode-uri'

import { isWindows } from '@sourcegraph/cody-shared'

import { setDisplayPathEnvInfo } from '../../../lib/shared/src/editor/displayPath'

beforeAll(() => {
    const isWin = isWindows()
    setDisplayPathEnvInfo({ isWindows: isWin, workspaceFolders: [isWin ? URI.file('C:\\') : URI.file('/')] })
})
