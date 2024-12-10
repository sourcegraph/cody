import { CodyIDE, FeatureFlag } from '@sourcegraph/cody-shared'
import { S2_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import {
    ArrowLeftRightIcon,
    ArrowRightIcon,
    BuildingIcon,
    ExternalLinkIcon,
    EyeIcon,
    HeartIcon,
    TerminalIcon,
    Users2Icon,
    XIcon,
} from 'lucide-react'
import { type FunctionComponent, type ReactNode, useCallback, useMemo, useState } from 'react'
import SourcegraphIcon from '../../resources/sourcegraph-mark.svg'
import type { UserAccountInfo } from '../Chat'
import { CodyLogo } from '../icons/CodyLogo'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useTelemetryRecorder } from '../utils/telemetry'
import { useFeatureFlag } from '../utils/useFeatureFlags'
import { useLocalStorage } from './hooks'
import { Button } from './shadcn/ui/button'

interface Notice {
    id: string
    isVisible?: boolean
    content: JSX.Element
}

type NoticeVariants = 'default' | 'warning'
type NoticeIDs = 'DogfoodS2' | 'TeamsUpgrade' | 'DeepCody'

interface NoticesProps {
    user: UserAccountInfo
    // Whether to show the Sourcegraph Teams upgrade CTA or not.
    isTeamsUpgradeCtaEnabled?: boolean
}

const storageKey = 'DismissedWelcomeNotices'

export const Notices: React.FC<NoticesProps> = ({ user, isTeamsUpgradeCtaEnabled }) => {
    const telemetryRecorder = useTelemetryRecorder()

    const isDeepCodyEnabled = useFeatureFlag(FeatureFlag.DeepCody)
    const isDeepCodyShellContextSupported = useFeatureFlag(FeatureFlag.DeepCodyShellContext)

    // dismissed notices from local storage
    const [dismissedNotices, setDismissedNotices] = useLocalStorage(storageKey, '')
    // session-only dismissal - for notices we want to show if the user logs out and logs back in.
    const [sessionDismissedNotices, setSessionDismissedNotices] = useState<string[]>([])

    const dismissNotice = useCallback(
        (noticeId: string, type: 'sessional' | 'permanent' = 'permanent') => {
            if (type === 'permanent') {
                // For notices we don't want to show again after it's been dismissed once
                setDismissedNotices(prev => [...prev, noticeId].join(''))
            } else {
                // For notices we want to show if the user logs out and logs back in.
                setSessionDismissedNotices(prev => [...prev, noticeId])
                telemetryRecorder.recordEvent('cody.notice.cta', 'clicked', {
                    privateMetadata: { noticeId, title: 'close' },
                })
            }
        },
        [telemetryRecorder, setDismissedNotices]
    )

    const notices: Notice[] = useMemo(
        () => [
            {
                id: 'DeepCody',
                isVisible: isDeepCodyEnabled && user.IDE !== CodyIDE.Web,
                content: (
                    <NoticeContent
                        id="DeepCody"
                        variant="default"
                        title="Deep Cody (Experimental)"
                        message="An AI agent powered by Claude 3.5 Sonnet (New) and other models with tool-use capabilities to gather contextual information for enhanced responses. It can search your codebase, browse the web, execute shell commands in your terminal (when enabled), and utilize any configured tools to retrieve necessary context."
                        onDismiss={() => dismissNotice('DeepCody')}
                        actions={
                            isDeepCodyShellContextSupported
                                ? [
                                      {
                                          label: 'Enable Command Execution in Settings',
                                          onClick: () =>
                                              getVSCodeAPI().postMessage({
                                                  command: 'command',
                                                  id: 'cody.status-bar.interacted',
                                              }),
                                          variant: 'default',
                                          icon: <TerminalIcon size={14} />,
                                          iconPosition: 'start',
                                      },
                                  ]
                                : [
                                      {
                                          label: 'Contact admins to enable Command Execution',
                                          onClick: () => {},
                                          variant: 'secondary',
                                      },
                                  ]
                        }
                    />
                ),
            },
            /**
             * Notifies users that they are eligible for a free upgrade to Sourcegraph Teams.
             * TODO: Update to live link https://linear.app/sourcegraph/issue/CORE-535/cody-clients-migrate-ctas-to-live-links
             */
            {
                id: 'TeamsUpgrade',
                isVisible: user.isDotComUser && isTeamsUpgradeCtaEnabled && user.IDE !== CodyIDE.Web,
                content: (
                    <NoticeContent
                        id="TeamsUpgrade"
                        variant="default"
                        title="Sourcegraph Teams is here"
                        message="You now are eligible for an upgrade to teams for free"
                        onDismiss={() => dismissNotice('TeamsUpgrade')}
                        actions={[
                            {
                                // TODO: Update to live link https://linear.app/sourcegraph/issue/CORE-535/cody-clients-migrate-ctas-to-live-links
                                label: 'Upgrade to Teams',
                                href: 'https://sourcegraph.com/cody/manage',
                                variant: 'default',
                                icon: <Users2Icon size={14} />,
                                iconPosition: 'start',
                            },
                            {
                                // TODO: Update to live link https://linear.app/sourcegraph/issue/CORE-535/cody-clients-migrate-ctas-to-live-links
                                label: 'Learn More',
                                href: 'https://sourcegraph.com/docs',
                                variant: 'ghost',
                                icon: <ExternalLinkIcon size={14} />,
                                iconPosition: 'end',
                            },
                        ]}
                    />
                ),
            },
            /**
             * For Sourcegraph team members who are using Sourcegraph.com to remind them that we want to be dogfooding S2.
             */
            {
                id: 'DogfoodS2',
                isVisible:
                    user.isDotComUser &&
                    user.user.organizations?.some(org => org.name === 'sourcegraph') &&
                    user.IDE !== CodyIDE.Web,
                content: (
                    <NoticeContent
                        id="DogfoodS2"
                        variant="warning"
                        title=""
                        message="Sourcegraph team members should use S2 not dotcom (except when testing dotcom-specific behavior) so that we dogfood our enterprise customer experience."
                        onDismiss={() => dismissNotice('DogfoodS2', 'sessional')}
                        actions={[
                            {
                                label: 'Switch to S2',
                                onClick: () =>
                                    getVSCodeAPI().postMessage({
                                        command: 'auth',
                                        authKind: 'switch',
                                        endpoint: S2_URL.href,
                                    }),
                                variant: 'default',
                                icon: <ArrowLeftRightIcon size={14} />,
                                iconPosition: 'end',
                            },
                            {
                                label: 'Dismiss',
                                onClick: () => dismissNotice('DogfoodS2', 'sessional'),
                                variant: 'secondary',
                            },
                        ]}
                    />
                ),
            },
        ],
        [
            user,
            dismissNotice,
            isTeamsUpgradeCtaEnabled,
            isDeepCodyEnabled,
            isDeepCodyShellContextSupported,
        ]
    )

    // First, modify the activeNotice useMemo to add conditional logic for DogfoodS2
    const activeNotice = useMemo(
        () =>
            notices.find(notice => {
                if (notice.id === 'DogfoodS2') {
                    return notice.isVisible && !sessionDismissedNotices.includes(notice.id)
                }
                return notice.isVisible && !dismissedNotices?.includes(notice.id)
            }),
        [dismissedNotices, sessionDismissedNotices, notices]
    )

    if (!activeNotice) {
        return null
    }

    return (
        <div className="tw-flex tw-flex-col tw-mx-4 tw-my-2 tw-p-4 tw-gap-2">{activeNotice.content}</div>
    )
}

interface NoticeContentProps {
    variant: NoticeVariants
    id: NoticeIDs
    title: string
    message: string
    actions: Array<{
        label: string
        onClick?: () => void
        href?: string
        variant: 'default' | 'ghost' | 'secondary'
        icon?: ReactNode
        iconPosition?: 'start' | 'end'
    }>
    onDismiss: () => void
}

const NoticeContent: FunctionComponent<NoticeContentProps> = ({
    variant,
    title,
    message,
    actions,
    id,
    onDismiss,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const bgColor = {
        default: 'tw-bg-accent tw-bg-opacity-50',
        warning: 'tw-bg-red-700 tw-text-white',
    }[variant]

    const header = {
        DeepCody: (
            <>
                <CodyLogo size={16} />
            </>
        ),
        DogfoodS2: (
            <>
                <EyeIcon />
                <HeartIcon />
                <BuildingIcon />
            </>
        ),
        TeamsUpgrade: (
            <>
                <CodyLogo size={16} />
                <ArrowRightIcon size={16} />
                <img src={SourcegraphIcon} alt="Sourcegraph Logo" className="tw-h-[16px]" />
            </>
        ),
    }[id]

    return (
        <aside
            className={`tw-w-full tw-relative tw-rounded-md tw-flex tw-flex-col tw-gap-2 tw-p-4 ${bgColor}`}
        >
            <div className="tw-flex tw-gap-3 tw-mb-2">{header}</div>
            {title && <h1 className="tw-text-lg tw-font-semibold">{title}</h1>}
            <p>{message}</p>
            <div className="tw-mt-3 tw-flex tw-gap-3">
                {actions.map((action, _index) => (
                    <Button
                        key={action.label + '-button'}
                        variant={action.variant}
                        size="sm"
                        onClick={() => {
                            action.onClick?.()
                            telemetryRecorder.recordEvent('cody.notice.cta', 'clicked', {
                                privateMetadata: { noticeId: id, title: action.label },
                            })
                        }}
                        className="tw-flex tw-gap-1"
                    >
                        {action.iconPosition === 'start' && action.icon}
                        {action.href ? (
                            <a
                                href={action.href}
                                target="_blank"
                                rel="noreferrer"
                                className="tw-text-button-foreground hover:tw-text-button-foreground"
                            >
                                {action.label}
                            </a>
                        ) : (
                            <span>{action.label}</span>
                        )}
                        {action.iconPosition === 'end' && action.icon}
                    </Button>
                ))}
            </div>
            {/* Dismiss button. */}
            <Button variant="ghost" onClick={onDismiss} className="tw-absolute tw-top-2 tw-right-2">
                <XIcon size="14" />
            </Button>
        </aside>
    )
}
