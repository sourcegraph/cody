import type { CodyNotice } from '@sourcegraph/cody-shared'
import { XIcon } from 'lucide-react'
import { type FunctionComponent, useCallback, useMemo, useState } from 'react'
import { useTelemetryRecorder } from '../utils/telemetry'
import { MarkdownFromCody } from './MarkdownFromCody'
import { useLocalStorage } from './hooks'
import { Button } from './shadcn/ui/button'

interface Notice {
    id: string
    isVisible?: boolean
    content: JSX.Element
}

interface NoticesProps {
    instanceNotices: CodyNotice[]
}

const storageKey = 'DismissedWelcomeNotices'

export const Notices: React.FC<NoticesProps> = ({ instanceNotices }) => {
    const telemetryRecorder = useTelemetryRecorder()

    // dismissed notices from local storage
    const [dismissedNotices, setDismissedNotices] = useLocalStorage(storageKey, '')
    // session-only dismissal - for notices we want to show if the user logs out and logs back in.
    const [_, setSessionDismissedNotices] = useState<string[]>([])

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
        ],
        [dismissNotice, instanceNotices]
    )

    const activeNotice = useMemo(
        () =>
            notices.find(notice => {
                return notice.isVisible && !dismissedNotices?.includes(notice.id)
            }),
        [dismissedNotices, notices]
    )

    if (!activeNotice) {
        return null
    }

    return (
        <div className="tw-flex tw-flex-col tw-mx-2 tw-my-2 tw-p-2 tw-gap-2">{activeNotice.content}</div>
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
