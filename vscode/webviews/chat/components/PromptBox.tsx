import { UserAvatar } from "../../components/UserAvatar"
import { useUserAccountInfo } from "../../utils/useConfig"
import type { LucideProps } from "lucide-react"
import type { ForwardRefExoticComponent } from "react"

import styles from "./PromptBox.module.css"

export interface PromptBoxProps {
    name: string
    description: string
    icon?: ForwardRefExoticComponent<Omit<LucideProps, "ref">>
}

export default function PromptBox({ name, description, icon }: PromptBoxProps) {
    const userInfo = useUserAccountInfo()
    const Icon = icon ? icon : undefined

    return (
        <div className={styles.container}>
            <div className={styles.glyph}>
                {Icon ? (
                    <Icon className={styles.icon} strokeWidth={1.25} />
                ) : (
                    <UserAvatar className={styles.avatar} user={userInfo.user} size={24} />
                )}
            </div>
            <div className={styles.definition}>
                <div className={styles.name}>{name}</div>
                <div className={styles.description}>{description}</div>
            </div>
        </div >
    )
}
