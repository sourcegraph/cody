import { clsx } from 'clsx'
import { useCallback, useState } from 'react'
import { CODY_FEEDBACK_URL } from '../../../src/chat/protocol'
import { Button } from '../../components/shadcn/ui/button'
import styles from './FeedbackButtons.module.css'

interface FeedbackButtonsProps {
    className?: string
    disabled?: boolean
    feedbackButtonsOnSubmit: (text: string) => void
}

export const FeedbackButtons: React.FunctionComponent<FeedbackButtonsProps> = ({
    className,
    feedbackButtonsOnSubmit,
}) => {
    const [feedbackSubmitted, setFeedbackSubmitted] = useState('')

    const onFeedbackBtnSubmit = useCallback(
        (text: string) => {
            setFeedbackSubmitted(text)
            feedbackButtonsOnSubmit(text)
        },
        [feedbackButtonsOnSubmit]
    )

    return (
        <div className={clsx(styles.feedbackButtons, className)}>
            {!feedbackSubmitted && (
                <>
                    <Button
                        className={clsx('tw-text-muted-foreground', styles.feedbackButton)}
                        variant="ghostRoundedIcon"
                        type="button"
                        onClick={() => onFeedbackBtnSubmit('thumbsUp')}
                        tabIndex={-1}
                    >
                        <i className="codicon codicon-thumbsup" />
                    </Button>
                    <Button
                        className={clsx('tw-text-muted-foreground', styles.feedbackButton)}
                        variant="ghostRoundedIcon"
                        type="button"
                        onClick={() => onFeedbackBtnSubmit('thumbsDown')}
                        tabIndex={-1}
                    >
                        <i className="codicon codicon-thumbsdown" />
                    </Button>
                </>
            )}
            {feedbackSubmitted === 'thumbsUp' && (
                <Button
                    className={clsx(styles.feedbackButton)}
                    variant="ghostRoundedIcon"
                    type="button"
                    disabled={true}
                    title="Thanks for your feedback"
                >
                    <i className="codicon codicon-thumbsup" />
                    <i className="codicon codicon-check" />
                </Button>
            )}
            {feedbackSubmitted === 'thumbsDown' && (
                <span className={styles.thumbsDownFeedbackContainer}>
                    <Button
                        className={clsx(styles.feedbackButton)}
                        variant="ghostRoundedIcon"
                        type="button"
                        disabled={true}
                        title="Thanks for your feedback"
                    >
                        <i className="codicon codicon-thumbsdown" />
                        <i className="codicon codicon-check" />
                    </Button>
                    <a
                        href={String(CODY_FEEDBACK_URL)}
                        target="_blank"
                        title="Help improve Cody by providing more feedback about the quality of this response"
                        className="tw-text-link hover:tw-underline"
                        rel="noreferrer"
                    >
                        Give Feedback
                    </a>
                </span>
            )}
        </div>
    )
}
