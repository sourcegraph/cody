import type { LucideProps } from 'lucide-react'
import type { ForwardRefExoticComponent } from 'react'
import { UserAvatar } from '../../components/UserAvatar'
import { useUserAccountInfo } from '../../utils/useConfig'

import type { Prompt } from '@sourcegraph/cody-shared'
import styles from './PromptBox.module.css'

export interface PromptBoxProps {
    onSelect: () => void
    prompt: Prompt
    icon?: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
}

export default function PromptBox({ prompt, icon, onSelect }: PromptBoxProps) {
    const { name, description } = prompt
    const userInfo = useUserAccountInfo()
    const Icon = icon ? icon : undefined

    return (
        <div onMouseUp={onSelect} className={styles.container}>
            <div className={styles.glyph}>
                {Icon ? (
                    <Icon className={styles.icon} strokeWidth={1} />
                ) : (
                    <UserAvatar className={styles.avatar} user={userInfo.user} size={24} />
                )}
            </div>
            <div className={styles.definition}>
                <div className={styles.name}>{name}</div>
                <div className={styles.description}>
                    {description !== '' ? description : <em>(no description provided)</em>}
                </div>
            </div>
        </div>
    )
}
