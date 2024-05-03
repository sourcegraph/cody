import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    type MentionQuery,
    type RangeData,
    displayLineRange,
    displayPath,
    displayPathBasename,
    displayPathDirname,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import { type FunctionComponent, useEffect, useRef } from 'react'
import {
    FILE_HELP_LABEL,
    FILE_RANGE_TOOLTIP_LABEL,
    GENERAL_HELP_LABEL,
    LARGE_FILE_WARNING_LABEL,
    NO_FILE_MATCHES_LABEL,
    NO_PACKAGE_MATCHES_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    NO_SYMBOL_MATCHES_LABEL,
    PACKAGE_HELP_LABEL,
    SYMBOL_HELP_LABEL,
} from '../../../../src/chat/context/constants'
import styles from './OptionsList.module.css'
import { type MentionTypeaheadOption, RANGE_MATCHES_REGEXP } from './atMentions'

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
            <h3 className={classNames(styles.item, styles.helpItem)}>
                <span>{getHelpText(mentionQuery, options)}</span>
                <br />
            </h3>
            {options.length > 0 && (
                <ul ref={ref} className={styles.list}>
                    {options.map((option, i) => (
                        <Item
                            query={query}
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
                ? isValidLineRangeQuery(mentionQuery.text)
                    ? FILE_RANGE_TOOLTIP_LABEL
                    : FILE_HELP_LABEL
                : NO_FILE_MATCHES_LABEL
    }
}

const Item: FunctionComponent<{
    query: string
    isSelected: boolean
    onClick: () => void
    onMouseEnter: () => void
    option: MentionTypeaheadOption
    className?: string
}> = ({ query, isSelected, onClick, onMouseEnter, option, className }) => {
    const item = option.item
    const isFileType = item.type === 'file'
    const isPackageType = item.type === 'package'
    const icon =
        item.type === 'symbol' ? (item.kind === 'class' ? 'symbol-structure' : 'symbol-method') : null
    const title =
        item.title ?? (isFileType || isPackageType ? displayPathBasename(item.uri) : item.symbolName)

    const range = getLineRangeInMention(query, item.range)
    const dir = decodeURIComponent(displayPathDirname(item.uri))
    const description = isPackageType
        ? ''
        : isFileType
          ? `${range ? `Lines ${range} · ` : ''}${dir === '.' ? '' : dir}`
          : `${displayPath(item.uri)}:${getLineRangeInMention(query, item.range)}`

    const isLargeFile = isFileType && item.isTooLarge
    const warning =
        isLargeFile && !item.range && !isValidLineRangeQuery(query) ? LARGE_FILE_WARNING_LABEL : ''

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={classNames(
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
                    className={classNames(
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

const isValidLineRangeQuery = (query: string): boolean =>
    query.endsWith(':') || RANGE_MATCHES_REGEXP.test(query)

/**
 * Gets the display line range from the query string.
 */
function getLineRangeInMention(query: string, range?: RangeData): string {
    // Parses out the start and end line numbers from the query if it contains a line range match.
    const queryRange = query.match(RANGE_MATCHES_REGEXP)
    if (query && queryRange?.[1]) {
        const [_, start, end] = queryRange
        const startLine = Number.parseInt(start)
        const endLine = end ? Number.parseInt(end) : Number.POSITIVE_INFINITY
        return `${startLine}-${endLine !== Number.POSITIVE_INFINITY ? endLine : '#'}`
    }
    // Passed in range string if no line number match.
    return range ? displayLineRange(range).toString() : ''
}
