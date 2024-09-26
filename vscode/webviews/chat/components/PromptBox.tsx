import { UserAvatar } from "../../components/UserAvatar"
import { useUserAccountInfo } from "../../utils/useConfig"
import type { LucideProps } from "lucide-react"
import type { ForwardRefExoticComponent } from "react"

export interface PromptBoxProps {
    name: string
    description: string
    icon?: ForwardRefExoticComponent<Omit<LucideProps, "ref">>
}

export default function PromptBox({ name, description, icon }: PromptBoxProps) {
    const userInfo = useUserAccountInfo()
    const Icon = icon ? icon : undefined

    return (
        <div className="container">
            {Icon ? (
                <Icon className="tw-w-16 tw-h-16" strokeWidth={1.25} />
            ) : (
                <UserAvatar user={userInfo.user} size={16} />
            )}
            <div className="definition">
                <div className="title">{name}</div>
                <div className="description">{description}</div>
            </div>
        </div>
    )
}
