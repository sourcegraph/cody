import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    type ContextItem,
    type ContextItemFile,
    type ContextItemGithubIssue,
    type ContextItemGithubPullRequest,
    type ContextItemMixin,
    type ContextItemSymbol,
    type MentionQuery,
    type RangeData,
    displayLineRange,
    displayPath,
    displayPathBasename,
    displayPathDirname,
    isDefined,
    parseMentionQuery,
    unhandledSwitchCase,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
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
import {
    MentionItemTypeaheadOption,
    MentionProviderTypeaheadOption,
    type MentionTypeaheadOption,
    RANGE_MATCHES_REGEXP,
} from './atMentions'

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
                    {options
                        .map((option, i) => {
                            const sharedProps = {
                                query,
                                isSelected: selectedIndex === i,
                                onClick: () => {
                                    setHighlightedIndex(i)
                                    selectOptionAndCleanUp(option)
                                },
                                onMouseEnter: () => {
                                    setHighlightedIndex(i)
                                },
                                className: styles.item,
                                key: option.key,
                            }
                            if (option instanceof MentionItemTypeaheadOption) {
                                return <Item {...sharedProps} option={option} />
                            }
                            if (option instanceof MentionProviderTypeaheadOption) {
                                return <MentionProvider {...sharedProps} option={option} />
                            }
                            return null
                        })
                        .filter(isDefined)}
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

interface ItemProps<T extends ContextItem> {
    query: string
    isSelected: boolean
    onClick: () => void
    onMouseEnter: () => void
    option: Omit<MentionTypeaheadOption, 'item'> & { item: T }
    className?: string
}
const FileItem: FunctionComponent<ItemProps<ContextItemFile>> = ({
    query,
    option,
    className,
    isSelected,
    onMouseEnter,
    onClick,
}) => {
    const item = option.item

    const title = item.title ?? displayPathBasename(item.uri)

    const range = getLineRangeInMention(query, item.range)
    const dir = decodeURIComponent(displayPathDirname(item.uri))
    const description = `${range ? `Lines ${range} · ` : ''}${dir === '.' ? '' : dir}`

    //     const range = getLineRangeInMention(query, item.range)
    //     const dir = decodeURIComponent(displayPathDirname(item.uri))
    //     const description = isPackageType
    //         ? ''
    //         : isFileType
    //           ? `${range ? `Lines ${range} · ` : ''}${dir === '.' ? '' : dir}`
    //           : `${displayPath(item.uri)}:${getLineRangeInMention(query, item.range)}`
    // >>>>>>> refs/heads/main

    const isLargeFile = item.isTooLarge
    const warning =
        isLargeFile && !item.range && !isValidLineRangeQuery(query) ? LARGE_FILE_WARNING_LABEL : ''

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

const SymbolItem: FunctionComponent<ItemProps<ContextItemSymbol>> = ({
    query,
    option,
    className,
    isSelected,
    onMouseEnter,
    onClick,
}) => {
    const item = option.item
    const icon = item.kind === 'class' ? 'symbol-structure' : 'symbol-method'
    const title = item.title ?? item.symbolName

    const description = `${displayPath(item.uri)}:${getLineRangeInMention(query, item.range)}`

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={clsx(className, styles.optionItem, isSelected && styles.selected)}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            <div className={styles.optionItemRow}>
                icon && (
                <i className={`codicon codicon-${icon}`} title={item.kind} />)
                <span className={clsx(styles.optionItemTitle)}>{title}</span>
                {description && <span className={styles.optionItemDescription}>{description}</span>}
            </div>
        </li>
    )
}

const MixinItem: FunctionComponent<ItemProps<ContextItemMixin>> = ({
    query,
    option,
    className,
    isSelected,
    onMouseEnter,
    onClick,
}) => {
    const item = option.item
    const description = item.description
    const title = item.title

    const icon = item.emoji ? (
        <span>{item.emoji}</span>
    ) : item.icon ? (
        <i className={`codicon codicon-${item.icon}`} />
    ) : null

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={clsx(className, styles.optionItem, isSelected && styles.selected)}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            <div className={styles.optionItemRow}>
                {icon}
                <span className={clsx(styles.optionItemTitle)}>{title}</span>
                {description && <span className={styles.optionItemDescription}>{description}</span>}
            </div>
        </li>
    )
}

const GithubItem: FunctionComponent<ItemProps<ContextItemGithubIssue | ContextItemGithubPullRequest>> =
    ({ query, option, className, isSelected, onMouseEnter, onClick }) => {
        const item = option.item
        const title = item.title ?? displayPathBasename(item.uri)
        const description = `${item.owner}/${item.repoName}`

        return (
            // biome-ignore lint/a11y/useKeyWithClickEvents:
            <li
                key={option.key}
                tabIndex={-1}
                className={clsx(className, styles.optionItem, isSelected && styles.selected)}
                ref={option.setRefElement}
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
                role="option"
                aria-selected={isSelected}
                onMouseEnter={onMouseEnter}
                onClick={onClick}
            >
                <div className={styles.optionItemRow}>
                    <span className={clsx(styles.optionItemTitle)}>{title}</span>
                    {description && <span className={styles.optionItemDescription}>{description}</span>}
                </div>
            </li>
        )
    }

const Item: FunctionComponent<ItemProps<ContextItem>> = props => {
    const item = props.option.item

    switch (item.type) {
        //todo(rnauta): the typechecker is botched here
        case 'file': {
            return <FileItem {...(props as ItemProps<ContextItemFile>)} />
        }
        case 'symbol':
            return <SymbolItem {...(props as ItemProps<ContextItemSymbol>)} />
        case 'mixin':
            return <MixinItem {...(props as ItemProps<ContextItemMixin>)} />
        case 'package':
            return <></>
        case 'github_issue':
        case 'github_pull_request':
            return (
                <GithubItem
                    {...(props as ItemProps<ContextItemGithubIssue | ContextItemGithubPullRequest>)}
                />
            )
        default:
            return unhandledSwitchCase<ContextItem>(item, () => <></>)
    }
}

// ensures exhaustive switch

interface MentionProviderProps {
    query: string
    isSelected: boolean
    onClick: () => void
    onMouseEnter: () => void
    option: MentionProviderTypeaheadOption
    className?: string
}
const MentionProvider: FunctionComponent<MentionProviderProps> = ({
    option,
    className,
    onMouseEnter,
    isSelected,
    onClick,
}) => {
    const { provider } = option
    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={clsx(className, styles.optionItem, isSelected && styles.selected)}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            <div className={styles.optionItemRow}>
                <i className={`codicon codicon-${provider.icon}`} title={provider.id} />
                <span className={clsx(styles.optionItemTitle)}>{provider.triggerPrefixes[0]}</span>
                <span className={styles.optionItemDescription}>
                    {provider.description ?? 'No description'}
                </span>
            </div>
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
