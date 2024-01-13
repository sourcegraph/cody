import { beforeAll } from 'vitest'
import { URI } from 'vscode-uri'

import { isWindows } from '../common/platform'
import { setDisplayPathEnvInfo } from '../editor/displayPath'

beforeAll(() => {
    const isWin = isWindows()
    setDisplayPathEnvInfo({ isWindows: isWin, workspaceFolders: [isWin ? URI.file('C:\\') : URI.file('/')] })
})
