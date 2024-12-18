import { CodyIDE, type CodyNotice, FeatureFlag } from '@sourcegraph/cody-shared'
import { DOTCOM_WORKSPACE_UPGRADE_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { S2_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import {
    ArrowLeftRightIcon,
    ArrowRightIcon,
    BuildingIcon,
    ExternalLinkIcon,
    EyeIcon,
    HeartIcon,
    Users2Icon,
    XIcon,
} from 'lucide-react'
import { type FunctionComponent, type ReactNode, useCallback, useMemo, useState } from 'react'
import SourcegraphIcon from '../../resources/sourcegraph-mark.svg'
import { DOTCOM_WORKSPACE_LEARN_MORE_URL } from '../../src/chat/protocol'
import type { UserAccountInfo } from '../Chat'
import { CodyLogo } from '../icons/CodyLogo'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useTelemetryRecorder } from '../utils/telemetry'
import { useFeatureFlag } from '../utils/useFeatureFlags'
import { MarkdownFromCody } from './MarkdownFromCody'
import { useLocalStorage } from './hooks'
import { Button } from './shadcn/ui/button'

interface Notice {
    id: string
    isVisible?: boolean
    content: JSX.Element
}

type NoticeVariants = 'default' | 'warning'
type NoticeIDs = 'DogfoodS2' | 'TeamsUpgrade' | 'DeepCodyDotCom' | 'DeepCodyEnterprise'

interface NoticesProps {
    user: UserAccountInfo
    // Whether to show the Sourcegraph Teams upgrade CTA or not.
    isTeamsUpgradeCtaEnabled?: boolean
    instanceNotices: CodyNotice[]
}

const storageKey = 'DismissedWelcomeNotices'

export const Notices: React.FC<NoticesProps> = ({ user, isTeamsUpgradeCtaEnabled, instanceNotices }) => {
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

    const settingsNameByIDE =
        user.IDE === CodyIDE.JetBrains
            ? 'Settings Editor'
            : user.IDE === CodyIDE.VSCode
              ? 'settings.json'
              : 'Extension Settings'

    const notices: Notice[] = useMemo(
        () => [
            ...instanceNotices.map(notice => ({
                id: notice.key,
                isVisible: true,
                content: (
                    <MarkdownNotice
                        title={notice.title}
                        content={notice.message}
                        onDismiss={() => dismissNotice(notice.key)}
                    />
                ),
            })),
            {
                id: 'DeepCody',
                isVisible: (isDeepCodyEnabled || user.isCodyProUser) && user.IDE !== CodyIDE.Web,
                content: (
                    <NoticeContent
                        id={user.isCodyProUser ? 'DeepCodyDotCom' : 'DeepCodyEnterprise'}
                        variant="default"
                        title="Deep Cody (Experimental)"
                        message={
                            "An early preview of agentic experience powered by Claude 3.5 Sonnet and other models to enrich context and leverage different tools for better quality responses. Deep Cody does this by searching your codebase, browsing the web, and running terminal commands (once enabled)! To enable terminal commands, set 'cody.agentic.context.experimentalShell' to true in your " +
                            settingsNameByIDE +
                            '.'
                        }
                        onDismiss={() =>
                            dismissNotice(user.isCodyProUser ? 'DeepCodyDotCom' : 'DeepCodyEnterprise')
                        }
                        info="Usage limits apply during the experimental phase."
                        footer={
                            !isDeepCodyShellContextSupported
                                ? 'Contact admins to enable Command Execution'
                                : ''
                        }
                        actions={[]}
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
                                href: DOTCOM_WORKSPACE_UPGRADE_URL.href,
                                variant: 'default',
                                icon: <Users2Icon size={14} />,
                                iconPosition: 'start',
                            },
                            {
                                // TODO: Update to live link https://linear.app/sourcegraph/issue/CORE-535/cody-clients-migrate-ctas-to-live-links
                                label: 'Learn More',
                                href: DOTCOM_WORKSPACE_LEARN_MORE_URL.href,
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
            settingsNameByIDE,
            instanceNotices,
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
        <div className="tw-flex tw-flex-col tw-mx-2 tw-my-2 tw-p-2 tw-gap-2">{activeNotice.content}</div>
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
    info?: string
    footer?: string
}

const NoticeContent: FunctionComponent<NoticeContentProps> = ({
    variant,
    title,
    message,
    actions,
    id,
    info,
    footer,
    onDismiss,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const bgColor = {
        default: 'tw-bg-accent tw-bg-opacity-50',
        warning: 'tw-bg-red-700 tw-text-white',
    }[variant]

    const header = {
        DeepCodyDotCom: (
            <>
                <CodyLogo size={16} />
            </>
        ),
        DeepCodyEnterprise: (
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
            {info && <p className="tw-mb-2">ⓘ {info}</p>}
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
            {footer && <p className="tw-mt-2">{footer}</p>}
            {/* Dismiss button. */}
            <Button variant="ghost" onClick={onDismiss} className="tw-absolute tw-top-2 tw-right-2">
                <XIcon size="14" />
            </Button>
        </aside>
    )
}

interface MarkdownNotice {
    title: string
    content: string
    onDismiss: () => void
}

const MarkdownNotice: FunctionComponent<MarkdownNotice> = props => {
    const { title, content, onDismiss } = props
    const message = content.length > 240 ? `${content.slice(0, 240)}...` : content

    return (
        <div
            className="tw-bg-popover tw-my-2 tw-mx-2 tw-border tw-border-border tw-relative tw-rounded-lg tw-flex tw-flex-col tw-gap-2 tw-pt-4 tw-pb-6 tw-px-6"
            data-markdown-notice=""
        >
            {title && (
                <h1 className="tw-text-md tw-font-semibold tw-text-title tw-flex tw-flex-row tw-items-center tw-gap-3 tw-my-1">
                    {title}
                </h1>
            )}

            <MarkdownFromCody className="tw-text-subtle tw-leading-tight">{message}</MarkdownFromCody>

            <Button variant="ghost" onClick={onDismiss} className="tw-absolute tw-top-3 tw-right-2">
                <XIcon size="14" />
            </Button>
        </div>
    )
}
