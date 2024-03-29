import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
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
    FILE_TOO_LARGE_LABEL,
    GENERAL_HELP_LABEL,
    NO_FILE_MATCHES_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    NO_SYMBOL_MATCHES_LABEL,
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

    const mentionQuery = parseMentionQuery(query)

    return (
        <div className={styles.container}>
            <h3 className={classNames(styles.item, styles.helpItem)}>
                <span>
                    {mentionQuery.type === 'empty'
                        ? GENERAL_HELP_LABEL
                        : mentionQuery.type === 'symbol'
                          ? options.length > 0 || !mentionQuery.text.length
                                ? SYMBOL_HELP_LABEL
                                : NO_SYMBOL_MATCHES_LABEL +
                                  (mentionQuery.text.length < 3 ? NO_SYMBOL_MATCHES_HELP_LABEL : '')
                          : options.length > 0
                              ? FILE_HELP_LABEL
                              : NO_FILE_MATCHES_LABEL}
                </span>
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

const Item: FunctionComponent<{
    query: string
    isSelected: boolean
    onClick: () => void
    onMouseEnter: () => void
    option: MentionTypeaheadOption
    className?: string
}> = ({ query, isSelected, onClick, onMouseEnter, option, className }) => {
    const item = option.item
    const icon =
        item.type === 'file' ? null : item.kind === 'class' ? 'symbol-structure' : 'symbol-method'
    const title = item.title ?? (item.type === 'file' ? displayPathBasename(item.uri) : item.symbolName)
    let range = item.range ? displayLineRange(item.range) : ''
    if (!range && /:(\d+)?-?(\d+)?/.test(query)) {
        range = parseLineRangeDisplayText(query)
    }
    const dirname = displayPathDirname(item.uri)
    const description =
        item.type === 'file'
            ? `${range ? `Lines ${range} · ` : ''}${dirname === '.' ? '' : dirname}`
            : displayPath(item.uri) + `:${range}`
    const warning = item.type === 'file' && item.isTooLarge ? FILE_TOO_LARGE_LABEL : undefined

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

function parseLineRangeDisplayText(text: string): string {
    const match = text.match(/:(\d+)?-?(\d+)?/)
    if (!match || match[1] === undefined) {
        return ''
    }

    const matches = [parseInt(match[1], 10), match[2] ? parseInt(match[2], 10) : '#']
    return matches.join('-')
}
