import { UserAvatar } from "../../components/UserAvatar"
import { useUserAccountInfo } from "../../utils/useConfig"
import type { LucideProps } from "lucide-react"
import type { ForwardRefExoticComponent } from "react"

import styles from "./PromptBox.module.css"
import type { Prompt } from "@sourcegraph/cody-shared"

export interface PromptBoxProps {
    onClick: () => void
    prompt: Prompt
    icon?: ForwardRefExoticComponent<Omit<LucideProps, "ref">>
}

export default function PromptBox({ prompt, icon, onClick }: PromptBoxProps) {
    const { name, description, definition } = prompt
    const userInfo = useUserAccountInfo()
    const Icon = icon ? icon : undefined

    // TODO: append the definition.text to the input field

    return (
        <div onMouseUp={onClick} className={styles.container}>
            <div className={styles.glyph}>
                {Icon ? (
                    <Icon className={styles.icon} strokeWidth={1.25} />
                ) : (
                    <UserAvatar className={styles.avatar} user={userInfo.user} size={24} />
                )}
            </div>
            <div className={styles.definition}>
                <div className={styles.name}>{name}</div>
                <div className={styles.description}>
                    {description !== ''
                        ? description
                        : <em>(no description provided)</em>}
                </div>
            </div>
        </div >
    )
}
