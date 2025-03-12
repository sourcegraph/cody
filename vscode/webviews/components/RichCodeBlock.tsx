import type { Guardrails } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { CheckIcon, CopyIcon, FileIcon, PlusIcon, SparklesIcon, TerminalIcon } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { CodeBlockPlaceholder } from './CodeBlockPlaceholder'
import { GuardrailsApplicator } from './GuardrailsManager'

// Import styles that match the existing code block UI
import styles from '../chat/ChatMessageContent/ChatMessageContent.module.css'

interface RichCodeBlockProps {
    syntaxHighlightedHtmlMarkup: string
    code: string // Raw text for copying/executing without HTML markup
    language?: string
    fileName?: string
    isCodeComplete: boolean
    isShellCommand?: boolean
    guardrails: Guardrails
    onCopy?: (code: string) => void
    onInsert?: (code: string, newFile?: boolean) => void
    onExecute?: (command: string) => void
    onApply?: (code: string, fileName?: string) => void
    className?: string
}

/**
 * RichCodeBlock is a component that displays code with syntax highlighting
 * and supports guardrails checking. It shows/hides code based on guardrails
 * check status and provides action buttons.
 *
 * Note: This component waits for isCodeComplete to be true before
 * triggering any guardrails checks, which prevents making excessive API calls
 * during incremental code block generation.
 */
export const RichCodeBlock: React.FC<RichCodeBlockProps> = ({
    // TODO: Elaborate on this comment.
    // SECURITY: We use dangerouslySetInnerHTML to render the HTML markup.
    syntaxHighlightedHtmlMarkup,
    code,
    language,
    fileName,
    isCodeComplete,
    isShellCommand = false,
    guardrails,
    onCopy,
    onInsert,
    onExecute,
    onApply,
    className,
}) => {
    // Use the existing button styles from ChatMessageContent.module.css
    const [copied, setCopied] = useState(false)

    // TODO: Check that we block the copy action until guardrails is satisfied
    const handleCopy = () => {
        if (!onCopy) return
        // TODO: block copying if guardrails are not satisfied and in enforced mode
        // Copy to clipboard - use the raw text version without HTML markup
        navigator.clipboard.writeText(code).catch(console.error)
        onCopy(code)

        // Show copied state temporarily
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // TODO: Add a retry button with refreshcwicon from lucide icons

    const actionButtons = (
        <div className={styles.actionButtons}>
            {onCopy && (
                <button
                    className={styles.button}
                    type="button"
                    onClick={handleCopy}
                    title="Copy to clipboard"
                >
                    <div className={styles.iconContainer}>
                        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    </div>
                    <span className="tw-hidden xs:tw-block">{copied ? 'Copied' : 'Copy'}</span>
                </button>
            )}

            {isShellCommand && onExecute && (
                <button
                    className={styles.button}
                    type="button"
                    onClick={() => onExecute(code.trim())}
                    title="Execute in terminal"
                >
                    <div className={styles.iconContainer}>
                        <TerminalIcon size={14} />
                    </div>
                    <span className="tw-hidden xs:tw-block">Execute</span>
                </button>
            )}

            {!isShellCommand && onApply && (
                <button
                    className={styles.button}
                    type="button"
                    onClick={() => onApply(code, fileName)}
                    title="Apply code"
                >
                    <div className={styles.iconContainer}>
                        <SparklesIcon size={14} />
                    </div>
                    <span className="tw-hidden xs:tw-block">Apply</span>
                </button>
            )}

            {!isShellCommand && onInsert && (
                <>
                    <button
                        className={styles.button}
                        type="button"
                        onClick={() => onInsert(code, false)}
                        title="Insert at cursor"
                    >
                        <div className={styles.iconContainer}>
                            <PlusIcon size={14} />
                        </div>
                        <span className="tw-hidden xs:tw-block">Insert</span>
                    </button>

                    <button
                        className={styles.button}
                        type="button"
                        onClick={() => onInsert(code, true)}
                        title="Save to new file"
                    >
                        <div className={styles.iconContainer}>
                            <FileIcon size={14} />
                        </div>
                        <span className="tw-hidden xs:tw-block">Save as</span>
                    </button>
                </>
            )}
        </div>
    )

    return (
        <GuardrailsApplicator
            code={code} // Use raw code for guardrails checks
            language={language}
            fileName={fileName}
            guardrails={guardrails}
            isCodeComplete={isCodeComplete}
        >
            {({ showCode, guardrailsStatus }) => (
                <div className={clsx('tw-overflow-hidden', className)}>
                    {!showCode ? (
                        // When code shouldn't be show, display a placeholder
                        <CodeBlockPlaceholder text={code} />
                    ) : (
                        // Otherwise show the actual code with syntax highlighting
                        <pre className={styles.content}>
                            <code
                                className={clsx(language && `language-${language}`)}
                                // biome-ignore lint/security/noDangerouslySetInnerHtml: This is markdown sanitized by rehype-sanitize
                                dangerouslySetInnerHTML={{ __html: syntaxHighlightedHtmlMarkup }}
                            />
                        </pre>
                    )}

                    {/* Actions bar */}
                    <div className={styles.buttonsContainer}>
                        <div className={styles.buttons}>
                            {actionButtons}
                            <div className={styles.metadataContainer}>{guardrailsStatus}</div>
                        </div>
                    </div>
                </div>
            )}
        </GuardrailsApplicator>
    )
}
