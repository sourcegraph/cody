import {
    MessageSquarePlusIcon,
} from 'lucide-react'
import PromptBox from './PromptBox'
import styles from './WelcomeMessage.module.css'

// const localStorageKey = 'chat.welcome-message-dismissed'

export default function WelcomeMessage() {
    return (
        <div className={styles.prompts}>
            <PromptBox
                name='Default Prompt'
                description='Default prompts have associated icons'
                icon={MessageSquarePlusIcon}
            />
            <PromptBox
                name="First Prompt"
                description="Custom prompts show the author's avatar"
            />
        </div>
    )
}
