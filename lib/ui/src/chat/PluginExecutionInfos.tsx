import * as React from 'react'

import { mdiCodeJson } from '@mdi/js'

import { ChatMessage, pluralize } from '@sourcegraph/cody-shared'

import { TranscriptAction } from './actions/TranscriptAction'

import styles from './PluginExecutionInfos.module.css'

interface PluginExecutionInfosProps {
    pluginExecutionInfos: NonNullable<ChatMessage['pluginExecutionInfos']>
    devMode?: boolean
    className?: string
}

export const PluginExecutionInfos: React.FC<PluginExecutionInfosProps> = ({
    pluginExecutionInfos,
    devMode,
    className,
}) => (
    <TranscriptAction
        title={{
            verb: 'Used',
            object: `${pluginExecutionInfos.length} ${pluralize('plugin', pluginExecutionInfos.length)}`,
        }}
        steps={[
            ...pluginExecutionInfos.map(({ pluginName, output, name, error, parameters }) => ({
                verb: '',
                object: (
                    <div>
                        <p>from "{pluginName}" got:</p>
                        <pre className={styles.item}>
                            {JSON.stringify(devMode ? { name, output, parameters, error } : error || output, null, 2)}
                        </pre>
                    </div>
                ),
                icon: mdiCodeJson,
            })),
        ]}
        className={className}
    />
)
