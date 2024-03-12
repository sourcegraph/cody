import type { Decorator } from '@storybook/react'

import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import styles from './VSCodeStoryDecorator.module.css'

setDisplayPathEnvInfo({
    isWindows: isWindows(),
    workspaceFolders: [isWindows() ? URI.file('C:\\') : URI.file('/')],
})

/**
 * A decorator for storybooks that makes them look like they're running in VS Code.
 */
export const VSCodeStoryDecorator: Decorator = story => <div className={styles.container}>{story()}</div>

export const WithBorder: Decorator = story => (
    <div className={styles.container} style={{ border: 'solid 1px #333' }}>
        {story()}
    </div>
)
