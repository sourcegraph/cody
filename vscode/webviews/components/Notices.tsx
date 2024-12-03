import { CodyIDE, isDotCom } from '@sourcegraph/cody-shared'
import { S2_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { ArrowRightIcon, BuildingIcon, EyeIcon, HeartIcon, XIcon } from 'lucide-react'
import { type FunctionComponent, useCallback, useMemo, useState } from 'react'
import SourcegraphIcon from '../../resources/sourcegraph-mark.svg'
import { CodyLogo } from '../icons/CodyLogo'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useUserAccountInfo } from '../utils/useConfig'
import { useSourcegraphTeamsUpgradeCtaFlag } from '../utils/useExperimentalFeature'
import { Button } from './shadcn/ui/button'

interface Notice {
    id: string
    isVisible?: boolean
    content: JSX.Element
}

type NoticeVariants = 'default' | 'warning'
type NoticeIDs = 'DogfoodS2' | 'TeamsUpgrade'

export const Notices: FunctionComponent = () => {
    const user = useUserAccountInfo()
    const isDotComUser = isDotCom(user.user.endpoint)
    const isSourcegraphOrgMember = user.user.organizations?.some(org => org.name === 'sourcegraph')
    const isCodyWeb = user.IDE === CodyIDE.Web

    // Whether to show the Sourcegraph Teams upgrade CTA or not.
    const isTeamsUpgradeCtaEnabled = useSourcegraphTeamsUpgradeCtaFlag()

    const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set())

    const dismissNotice = useCallback((noticeId: string) => {
        setDismissedNotices(prev => new Set([...prev, noticeId]))
    }, [])

    const notices: Notice[] = useMemo(
        () => [
            /**
             * TODO: update this to be based on user's subscription status once we have that information.
             */
            {
                id: 'TeamsUpgrade',
                isVisible: isDotComUser && isTeamsUpgradeCtaEnabled && !isCodyWeb,
                content: (
                    <NoticeContent
                        id="TeamsUpgrade"
                        variant="default"
                        title="Sourcegraph Teams is here"
                        message="You now are eligible for a upgrade to teams for free"
                        onDismiss={() => dismissNotice('TeamsUpgrade')}
                        actions={[
                            {
                                label: 'Upgrade to Teams',
                                href: 'https://sourcegraph.com',
                                variant: 'default',
                            },
                            {
                                label: 'Learn More',
                                href: 'https://sourcegraph.com/docs',
                                variant: 'ghost',
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
                isVisible: isDotComUser && isSourcegraphOrgMember && !isCodyWeb,
                content: (
                    <NoticeContent
                        id="DogfoodS2"
                        variant="warning"
                        title=""
                        message="Sourcegraph team members should use S2 not dotcom (except when testing dotcom-specific behavior) so that we dogfood our enterprise customer experience."
                        onDismiss={() => dismissNotice('DogfoodS2')}
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
                            },
                            {
                                label: 'Dismiss',
                                onClick: () => dismissNotice('DogfoodS2'),
                                variant: 'secondary',
                            },
                        ]}
                    />
                ),
            },
        ],
        [dismissNotice, isDotComUser, isSourcegraphOrgMember, isCodyWeb, isTeamsUpgradeCtaEnabled]
    )

    const activeNotice = useMemo(
        () => notices.find(notice => notice.isVisible && !dismissedNotices.has(notice.id)),
        [dismissedNotices, notices]
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
    const bgColor = {
        default: 'tw-bg-accent tw-bg-opacity-50',
        warning: 'tw-bg-red-700 tw-text-white',
    }[variant]

    const header = {
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
                <ArrowRightIcon className="tw-h-[16px]" />
                <img src={SourcegraphIcon} alt="Sourcegraph Logo" className="tw-h-[16px]" />
            </>
        ),
    }[id]

    return (
        <aside className={`tw-relative tw-rounded-md tw-flex tw-flex-col tw-gap-2 tw-p-4 ${bgColor}`}>
            <div className="tw-flex tw-gap-3 tw-mb-2">{header}</div>
            {title && <h1 className="tw-text-lg tw-font-semibold">{title}</h1>}
            <p>{message}</p>
            <div className="tw-mt-3 tw-flex tw-gap-3">
                {actions.map((action, _index) => (
                    <Button
                        key={action.label + '-button'}
                        variant={action.variant}
                        size="sm"
                        onClick={action.onClick}
                    >
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
