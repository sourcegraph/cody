import { XIcon } from 'lucide-react'
import { type FunctionComponent } from 'react'
import { ENTERPRISE_STARTER_LEARN_MORE_URL } from '../../../src/chat/protocol'
import { useLocalStorage } from '../../components/hooks'
import { Badge } from '../../components/shadcn/ui/badge'
import { Button } from '../../components/shadcn/ui/button'
import graphDarkCTA from '../../graph_dark.svg'
import graphLightCTA from '../../graph_light.svg'
import { SourcegraphLogo } from '../../icons/SourcegraphLogo'
import { useTelemetryRecorder } from '../../utils/telemetry'
export const WelcomeNotice: FunctionComponent = () => {
    // to test locally, bump the suffix
    const [dismissed, setDismissed] = useLocalStorage('sg_welcome_notice_001')
    if (dismissed === 1) {
        return null
    }
    const telemetryRecorder = useTelemetryRecorder()
    const dismissNotice = () => {
        setDismissed(1)
        telemetryRecorder.recordEvent('cody.notice.cta', 'clicked')
    }

    return (
        <div className="tw-w-full tw-relative tw-shadow-xl tw-bg-muted tw-border tw-border-input-border tw-p-8 tw-h-full tw-overflow-hidden tw-rounded-lg tw-flex tw-flex-col tw-justify-end tw-items-start tw-gap-4 tw-pb-0">
            <div className="tw-flex tw-mb-2">
                <SourcegraphLogo width={22} height={22} />
                <Badge className="tw-ml-3 tw-text-sm tw-py-[3px]">Enterprise Starter</Badge>
            </div>
            <h1 className="tw-font-semibold tw-text-[14px] tw-my-6">Enable collaboration with your team</h1>
            <p className="tw-text-muted-foreground tw-mb-2 tw-text-[12px]">
                Get your own workspace with AI-powered chat, prompt sharing and codebase serach. Automate tasks and accelerate development.
            </p>
            <div id="welcome-notice-buttons" className="tw-flex tw-gap-4 tw-mb-4 tw-text-[12px]">
                <Button type="button" variant="ghost" className="tw-px-2">
                    <a
                        href={ENTERPRISE_STARTER_LEARN_MORE_URL.href}
                        className=""
                        rel="noreferrer"
                        target="_blank"
                    >
                        Explore Workspaces
                    </a>
                </Button>
            </div>
            <img src={graphDarkCTA} alt="graph_dark" className="light:tw-hidden tw-w-full tw-m" />
            <img src={graphLightCTA} alt="graph_light" className="dark:tw-hidden tw-w-full" />
            <button
                type="button"
                className="tw-absolute tw-h-5 tw-w-5 tw-text-muted-foreground tw-top-6 tw-right-6"
                onClick={()=>dismissNotice()}
            >
                <XIcon size={16} />
            </button>
        </div>
    )
}
