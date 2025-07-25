import { type CodyNotice, isWorkspaceInstance } from '@sourcegraph/cody-shared'
import { S2_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import {
    ArrowLeftRightIcon,
    ArrowRightIcon,
    BuildingIcon,
    EyeIcon,
    HeartIcon,
    XIcon,
} from 'lucide-react'
import { type FunctionComponent, type ReactNode, useCallback, useMemo, useState } from 'react'
import SourcegraphIcon from '../../resources/sourcegraph-mark.svg'
import type { UserAccountInfo } from '../Chat'
import { CodyLogo } from '../icons/CodyLogo'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useTelemetryRecorder } from '../utils/telemetry'
import { MarkdownFromCody } from './MarkdownFromCody'
import { useLocalStorage } from './hooks'
import { Button } from './shadcn/ui/button'

interface Notice {
    id: string
    isVisible?: boolean
    content: JSX.Element
}

type NoticeVariants = 'default' | 'warning'
type NoticeIDs =
    | 'DogfoodS2'
    | 'TeamsUpgrade'
    | 'DeepCodyDotCom'
    | 'DeepCodyEnterprise'
    | 'CodyDeprecation'

interface NoticesProps {
    user: UserAccountInfo
    instanceNotices: CodyNotice[]
}

const storageKey = 'DismissedWelcomeNotices'

// Cody deprecation message constants
const CODY_DEPRECATION_MESSAGES = {
    ENTERPRISE_STARTER_WITH_CODY:
        "Cody in Enterprise Starter is being sunset. You can continue using Cody until July 23rd. Your code indexing and code search capabilities will not be affected. We encourage you to try Amp, Sourcegraph's new agentic coding tool.",
    ENTERPRISE_STARTER_WITHOUT_CODY:
        "Cody in Enterprise Starter is being sunset. Because you signed up after 6/25, your account doesn't have Cody, we encourage you to try Amp, Sourcegraph's new agentic coding tool.",
    PRO_USER:
        "Cody Pro is being sunset. You can continue using Cody until July 23rd, and your subscription will not renew. We encourage you to try Amp, Sourcegraph's new agentic coding tool.",
    FREE_USER_WITH_CODY:
        "Cody Free is being sunset. You can continue using Cody until July 23rd. We encourage you to try Amp, Sourcegraph's new agentic coding tool.",
    FREE_USER_WITHOUT_CODY:
        "Cody Free is being sunset. Because you signed up after 6/25, your account doesn't have Cody. We encourage you to try Amp, Sourcegraph's new agentic coding tool.",
} as const

export const Notices: React.FC<NoticesProps> = ({ user, instanceNotices }) => {
    const telemetryRecorder = useTelemetryRecorder()

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

    // Helper function to get the CodyDeprecation message based on user type and site Cody enablement
    const getCodyDeprecationMessage = useCallback(() => {
        if (isWorkspaceInstance(user.user.endpoint)) {
            // For workspace instances, check if the site has Cody enabled
            const hasCodyEnabled = user.siteHasCodyEnabled === true
            if (hasCodyEnabled) {
                return CODY_DEPRECATION_MESSAGES.ENTERPRISE_STARTER_WITH_CODY
            }
            return CODY_DEPRECATION_MESSAGES.ENTERPRISE_STARTER_WITHOUT_CODY
        }
        return CODY_DEPRECATION_MESSAGES.FREE_USER_WITHOUT_CODY
    }, [user])

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
            /**
             * Cody Deprecation Notice
             */
            {
                id: 'CodyDeprecation',
                isVisible: isWorkspaceInstance(user.user.endpoint),
                content: (
                    <NoticeContent
                        id="CodyDeprecation"
                        variant="default"
                        title="Important Notice"
                        message={getCodyDeprecationMessage()}
                        onDismiss={() => dismissNotice('CodyDeprecation', 'sessional')}
                        actions={[
                            {
                                label: 'Try Amp',
                                variant: 'default',
                                href: 'https://ampcode.com',
                            },
                            {
                                label: 'Learn more',
                                variant: 'ghost',
                                href: 'https://sourcegraph.com/blog/changes-to-cody-free-pro-and-enterprise-starter-plans',
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
                isVisible: false,
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
        [user, dismissNotice, instanceNotices, getCodyDeprecationMessage]
    )

    // First, modify the activeNotice useMemo to add conditional logic for DogfoodS2
    const activeNotice = useMemo(
        () =>
            notices.find(notice => {
                if (notice.id === 'DogfoodS2' || notice.id === 'CodyDeprecation') {
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
        default: 'tw-bg-accent tw-bg-opacity-50 tw-text-accent-foreground',
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
        CodyDeprecation: null,
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
                                privateMetadata: {
                                    noticeId: id,
                                    title: action.label,
                                },
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
                                className="tw-text-inherit hover:!tw-text-inherit"
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
            className="tw-bg-subtle tw-ml-2 tw-mr-2 tw-border tw-border-border tw-relative tw-rounded-lg tw-flex tw-flex-col tw-gap-2 tw-pt-4 tw-pb-6 tw-px-6"
            data-markdown-notice=""
        >
            {title && (
                <h1 className="tw-text-md tw-font-semibold tw-text-title tw-flex tw-flex-row tw-items-center tw-gap-3 tw-mt-1 tw-mb-2">
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
