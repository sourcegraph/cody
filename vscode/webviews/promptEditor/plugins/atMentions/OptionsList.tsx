import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    type MentionQuery,
    displayLineRange,
    displayPath,
    displayPathBasename,
    displayPathDirname,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { type FunctionComponent, useEffect, useRef } from 'react'
import {
    FILE_HELP_LABEL,
    FILE_RANGE_TOOLTIP_LABEL,
    GENERAL_HELP_LABEL,
    IGNORED_FILE_WARNING_LABEL,
    LARGE_FILE_WARNING_LABEL,
    NO_FILE_MATCHES_LABEL,
    NO_PACKAGE_MATCHES_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    NO_SYMBOL_MATCHES_LABEL,
    PACKAGE_HELP_LABEL,
    SYMBOL_HELP_LABEL,
} from '../../../../src/chat/context/constants'
import styles from './OptionsList.module.css'
import type { MentionTypeaheadOption } from './atMentions'

export const OptionsList: FunctionComponent<
    { query: string; options: MentionTypeaheadOption[] } & Pick<
        Parameters<MenuRenderFn<MentionTypeaheadOption>>[1],
        'selectedIndex' | 'setHighlightedIndex' | 'selectOptionAndCleanUp'
    >
> = ({ query, options, selectedIndex, setHighlightedIndex, selectOptionAndCleanUp }) => {
    const ref = useRef<HTMLUListElement>(null)
    // biome-ignore lint/correctness/useExhaustiveDependencies: Intent is to run whenever `options` changes.
    useEffect(() => {
        // Scroll to top when options change because the prior `selectedIndex` is invalidated.
        ref?.current?.scrollTo(0, 0)
        setHighlightedIndex(0)
    }, [options])

    const mentionQuery = parseMentionQuery(query, [])

    return (
        <div className={styles.container}>
            <h3 className={clsx(styles.item, styles.helpItem)}>
                <span>{getHelpText(mentionQuery, options)}</span>
                <br />
            </h3>
            {options.length > 0 && (
                <ul ref={ref} className={styles.list}>
                    {options.map((option, i) => (
                        <Item
                            query={mentionQuery}
                            isSelected={selectedIndex === i}
                            onClick={() => {
                                setHighlightedIndex(i)
                                selectOptionAndCleanUp(option)
                            }}
                            onMouseEnter={() => {
                                setHighlightedIndex(i)
                            }}
                            key={option.key}
                            option={option}
                            className={styles.item}
                        />
                    ))}
                </ul>
            )}
        </div>
    )
}

function getHelpText(mentionQuery: MentionQuery, options: MentionTypeaheadOption[]): string {
    switch (mentionQuery.provider) {
        case 'default':
            return GENERAL_HELP_LABEL
        case 'package':
            return options.length > 0 || mentionQuery.text.length < 3
                ? PACKAGE_HELP_LABEL
                : NO_PACKAGE_MATCHES_LABEL
        case 'symbol':
            return options.length > 0 || !mentionQuery.text.length
                ? SYMBOL_HELP_LABEL
                : NO_SYMBOL_MATCHES_LABEL +
                      (mentionQuery.text.length < 3 ? NO_SYMBOL_MATCHES_HELP_LABEL : '')
        default:
            return options.length > 0
                ? mentionQuery.maybeHasRangeSuffix
                    ? FILE_RANGE_TOOLTIP_LABEL
                    : FILE_HELP_LABEL
                : NO_FILE_MATCHES_LABEL
    }
}

function getDescription(item: MentionTypeaheadOption['item'], query: MentionQuery): string {
    const range = query.range ?? item.range
    switch (item.type) {
        case 'github_issue':
        case 'github_pull_request':
            return `${item.owner}/${item.repoName}`
        case 'file': {
            const dir = decodeURIComponent(displayPathDirname(item.uri))
            return `${range ? `Lines ${displayLineRange(range)} · ` : ''}${dir === '.' ? '' : dir}`
        }
        default:
            return `${displayPath(item.uri)}:${range ? displayLineRange(range) : ''}`
    }
}

const Item: FunctionComponent<{
    query: MentionQuery
    isSelected: boolean
    onClick: () => void
    onMouseEnter: () => void
    option: MentionTypeaheadOption
    className?: string
}> = ({ query, isSelected, onClick, onMouseEnter, option, className }) => {
    const item = option.item
    const isFileType = item.type === 'file'
    const isSymbol = item.type === 'symbol'
    const icon = isSymbol ? (item.kind === 'class' ? 'symbol-structure' : 'symbol-method') : null
    const title = item.title ?? (isSymbol ? item.symbolName : displayPathBasename(item.uri))
    const description = getDescription(item, query)

    const isIgnored = isFileType && item.isIgnored
    const isLargeFile = isFileType && item.isTooLarge
    let warning: string
    if (isIgnored) {
        warning = IGNORED_FILE_WARNING_LABEL
    } else if (isLargeFile && !item.range && !query.maybeHasRangeSuffix) {
        warning = LARGE_FILE_WARNING_LABEL
    } else {
        warning = ''
    }

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={clsx(
                className,
                styles.optionItem,
                isSelected && styles.selected,
                warning && styles.disabled
            )}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            <div className={styles.optionItemRow}>
                {item.type === 'symbol' && icon && (
                    <i className={`codicon codicon-${icon}`} title={item.kind} />
                )}
                <span
                    className={clsx(
                        styles.optionItemTitle,
                        warning && styles.optionItemTitleWithWarning
                    )}
                >
                    {title}
                </span>
                {description && <span className={styles.optionItemDescription}>{description}</span>}
            </div>
            {warning && <span className={styles.optionItemWarning}>{warning}</span>}
        </li>
    )
}
