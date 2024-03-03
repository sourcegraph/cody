import type { Decorator } from '@storybook/react'

import { isWindows, setDisplayPathEnvInfo } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { WithChatContextClient } from '../promptEditor/plugins/atMentions/chatContextClient'
import { dummyChatContextClient } from '../promptEditor/plugins/atMentions/fixtures'
import styles from './VSCodeStoryDecorator.module.css'

setDisplayPathEnvInfo({
    isWindows: isWindows(),
    workspaceFolders: [isWindows() ? URI.file('C:\\') : URI.file('/')],
})

/**
 * A decorator for storybooks that makes them look like they're running in VS Code.
 */
export const VSCodeStoryDecorator: Decorator = story => (
    <div className={styles.container}>
        <WithChatContextClient value={dummyChatContextClient}>{story()}</WithChatContextClient>
    </div>
)

export const WithBorder: Decorator = story => (
    <div className={styles.container} style={{ border: 'solid 1px #333' }}>
        {story()}
    </div>
)
