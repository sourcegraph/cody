import {
    AtSignIcon,
    MessageCircleQuestion,
    MessageSquarePlus,
    TextSelect,
    type LucideProps
} from "lucide-react"
import type { ForwardRefExoticComponent } from "react"

interface Tip {
    message: string;
    icon: ForwardRefExoticComponent<Omit<LucideProps, "ref">>;
}

interface WelcomeLink {
    icon: ForwardRefExoticComponent<Omit<LucideProps, "ref">>;
    text: string;
    url: string;
}

export const welcomeTips: Tip[] = [
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

export const welcomeLinks: WelcomeLink[] = [
    {
        icon: AtSignIcon,
        text: "Documentation",
        url: "https://sourcegraph.com/docs/cody"
    },
    {
        icon: MessageCircleQuestion,
        text: "Help and Support",
        url: "https://community.sourcegraph.com/"
    }
]
