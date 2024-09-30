import type { LucideProps } from 'lucide-react'
import type { ForwardRefExoticComponent } from 'react'
import { UserAvatar } from '../../components/UserAvatar'

import styles from './PromptBox.module.css'
import type { PromptOrDeprecatedCommand } from '@/components/promptList/PromptList'

export interface PromptBoxProps {
    onSelect: () => void
    prompt: PromptOrDeprecatedCommand
    icon?: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
}

export default function PromptBox({ prompt, icon, onSelect }: PromptBoxProps) {
    const isPrompt = prompt.type === 'prompt'
    const { name, description, createdBy } = isPrompt
        ? prompt.value
        : { ...prompt.value, name: prompt.value.key, createdBy: {} }
    // endpoint is required by UserAvatar component
    const userInfo = { ...createdBy ?? {}, endpoint: '' }
    const Icon = icon ? icon : undefined

    return (
        <div onMouseUp={onSelect} className={styles.container}>
            {isPrompt ? (
                <>
                    <div className={styles.glyph}>
                        {Icon ? (
                            <Icon className={styles.icon} strokeWidth={1} />
                        ) : (
                            <UserAvatar className={styles.avatar} user={userInfo} size={24} />
                        )}
                    </div>
                    <div className={styles.definition}>
                        <div className={styles.name}>{name}</div>
                        <div className={styles.description}>
                            {description !== '' ? description : <em>(no description provided)</em>}
                        </div>
                    </div>
                </>
            ) : (
                <div className={styles.definition}>
                    <div className={styles.name}>{name}</div>
                    <div className={styles.description}>
                        {description !== '' ? description : <em>(no description provided)</em>}
                    </div>
                </div>

            )}
        </div>
    )
}
