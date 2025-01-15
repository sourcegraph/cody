import { SG_WORKSPACES_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { XIcon } from 'lucide-react'
import { type FunctionComponent, useCallback } from 'react'
import { DOTCOM_WORKSPACE_LEARN_MORE_URL } from '../../../src/chat/protocol'
import { useLocalStorage } from '../../components/hooks'
import { Badge } from '../../components/shadcn/ui/badge'
import { Button } from '../../components/shadcn/ui/button'
import graphDarkCTA from '../../graph_dark.svg'
import graphLightCTA from '../../graph_light.svg'
import { SourcegraphLogo } from '../../icons/SourcegraphLogo'
import { useTelemetryRecorder } from '../../utils/telemetry'

export const WelcomeNotice: FunctionComponent = () => {
    const [dismissed, setDismissed] = useLocalStorage('sg_welcome_notice_00', 0)
    if (dismissed) {
        return null
    }
    const telemetryRecorder = useTelemetryRecorder()
    const dismissNotice = useCallback(() => {
        setDismissed(1)
        telemetryRecorder.recordEvent('cody.notice.cta', 'clicked')
    }, [telemetryRecorder, setDismissed])

    return (
        <div className="tw-w-full tw-relative tw-shadow-xl tw-bg-muted tw-border tw-border-input-border tw-p-8 tw-h-full tw-overflow-hidden tw-rounded-lg tw-flex tw-flex-col tw-justify-end tw-items-start tw-gap-4 tw-pb-0">
            <div className="tw-flex tw-mb-2">
                <SourcegraphLogo width={22} height={22} />
                <Badge className="tw-ml-3 tw-text-sm tw-py-[3px]">Enterprise Starter</Badge>
            </div>
            <h1 className="tw-font-semibold tw-text-[14px] tw-my-6">Unlock the Sourcegraph platform</h1>
            <p className="tw-text-muted-foreground tw-mb-2 tw-text-[12px]">
                Get search, AI chat, autocompletes and inline edits for your entire team to find,
                understand and fix code across all of your codebases.
            </p>
            <div id="welcome-notice-buttons" className="tw-flex tw-gap-4 tw-mb-4 tw-text-[12px]">
                <Button variant="outline" className="tw-px-2">
                    <a
                        href={SG_WORKSPACES_URL.href}
                        className="tw-text-foreground hover:tw-text-foreground"
                        rel="noreferrer"
                        target="_blank"
                    >
                        Create a workspace
                    </a>
                </Button>
                <Button type="button" variant="ghost" className="tw-px-2">
                    <a
                        href={DOTCOM_WORKSPACE_LEARN_MORE_URL.href}
                        className=""
                        rel="noreferrer"
                        target="_blank"
                    >
                        Learn more
                    </a>
                </Button>
            </div>
            <img src={graphDarkCTA} alt="graph_dark" className="light:tw-hidden tw-w-full tw-m" />
            <img src={graphLightCTA} alt="graph_light" className="dark:tw-hidden tw-w-full" />
            <button
                type="button"
                className="tw-absolute tw-h-5 tw-w-5 tw-text-muted-foreground tw-top-6 tw-right-6"
                onClick={dismissNotice}
            >
                <XIcon size={16} />
            </button>
        </div>
    )
}
