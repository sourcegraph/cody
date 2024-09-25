import type { ForwardRefExoticComponent } from "react"
import {
    AtSignIcon,
    BookOpenText,
    MessageCircleQuestion,
    MessageSquarePlus,
    TextSelect,
    type LucideProps
} from "lucide-react"

interface ChatViewTip {
    message: string;
    icon: ForwardRefExoticComponent<Omit<LucideProps, "ref">>;
}

interface ChatViewLink {
    icon: ForwardRefExoticComponent<Omit<LucideProps, "ref">>;
    text: string;
    url: string;
}

export const chatTips: ChatViewTip[] = [
    {
        message: "Type @ to add context to your chat",
        icon: AtSignIcon
    },
    {
        message: "Start a new chat using ⌥ / or the New Chat button",
        icon: MessageSquarePlus
    },
    {
        message: "To add code context from an editor, right click and use Add to Cody Chat",
        icon: TextSelect
    },
]

export const chatLinks: ChatViewLink[] = [
    {
        icon: BookOpenText,
        text: "Documentation",
        url: "https://sourcegraph.com/docs/cody"
    },
    {
        icon: MessageCircleQuestion,
        text: "Help and Support",
        url: "https://community.sourcegraph.com/"
    }
]
