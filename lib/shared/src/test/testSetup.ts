import { beforeAll } from 'vitest'

import { isWindows } from '../common/platform'
import { setDisplayPathEnvInfo } from '../editor/displayPath'

import { testFileUri } from './path-helpers'

beforeAll(() => {
    const isWin = isWindows()
    setDisplayPathEnvInfo({ isWindows: isWin, workspaceFolders: [testFileUri('')] })
})
