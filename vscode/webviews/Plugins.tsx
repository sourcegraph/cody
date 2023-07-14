import { defaultPlugins } from '@sourcegraph/cody-shared/src/plugins/built-in'

import styles from './Plugins.module.css'

interface PluginItemProps {
    name: string
    description: string
    enabled: boolean
    onToggle: (pluginName: string, enabled: boolean) => void
}

const PluginItem: React.FC<PluginItemProps> = ({ name, description, enabled, onToggle }) => (
    <label htmlFor={name} className={styles.plugin}>
        <p className={styles.pluginHeader}>{name}</p>
        <div>
            <input
                type="checkbox"
                id={name}
                checked={enabled}
                className={styles.pluginCheckbox}
                onChange={event => {
                    onToggle(name, event.target.checked)
                }}
            />
            <p className={styles.pluginDescription}>{description}</p>
        </div>
    </label>
)

export const Plugins: React.FC<{
    plugins: string[]
    onPluginToggle: PluginItemProps['onToggle']
}> = ({ plugins, onPluginToggle }) => (
    <div className={styles.container}>
        <ul className={styles.list}>
            {defaultPlugins.map(plugin => (
                <li key={plugin.name} className={styles.listItem}>
                    <PluginItem
                        name={plugin.name}
                        enabled={plugins.includes(plugin.name)}
                        description={plugin.description}
                        onToggle={onPluginToggle}
                    />
                </li>
            ))}
        </ul>
    </div>
)
