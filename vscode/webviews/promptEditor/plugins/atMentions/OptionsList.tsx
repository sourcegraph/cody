import type { MenuRenderFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    type ContextItem,
    type ContextItemFile,
    type ContextItemMixin,
    type ContextItemSymbol,
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
    NO_SYMBOL_MATCHES_HELP_LABEL,
    NO_SYMBOL_MATCHES_LABEL,
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
            <h3 className={classNames(styles.item, styles.helpItem)}>
                <span>
                    {mentionQuery.provider === 'default'
                        ? GENERAL_HELP_LABEL
                        : mentionQuery.provider === 'symbol'
                          ? options.length > 0 || !mentionQuery.text.length
                                ? SYMBOL_HELP_LABEL
                                : NO_SYMBOL_MATCHES_LABEL +
                                  (mentionQuery.text.length < 3 ? NO_SYMBOL_MATCHES_HELP_LABEL : '')
                          : options.length > 0
                              ? isValidLineRangeQuery(query)
                                    ? FILE_RANGE_TOOLTIP_LABEL
                                    : FILE_HELP_LABEL
                              : NO_FILE_MATCHES_LABEL}
                </span>
                <br />
            </h3>
            {options.length > 0 && (
                <ul ref={ref} className={styles.list}>
                    {options.map((option, i) => {
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
                    })}
                </ul>
            )}
        </div>
    )
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
    const dir = displayPathDirname(item.uri)
    const description = `${range ? `Lines ${range} · ` : ''}${dir === '.' ? '' : dir}`

    const isLargeFile = item.isTooLarge
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
            className={classNames(className, styles.optionItem, isSelected && styles.selected)}
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
                <span className={classNames(styles.optionItemTitle)}>{title}</span>
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
            className={classNames(className, styles.optionItem, isSelected && styles.selected)}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            <div className={styles.optionItemRow}>
                {icon}
                <span className={classNames(styles.optionItemTitle)}>{title}</span>
                {description && <span className={styles.optionItemDescription}>{description}</span>}
            </div>
        </li>
    )
}

const Item: FunctionComponent<ItemProps<ContextItem>> = props => {
    switch (props.option.item.type) {
        //todo(rnauta): the typechecker is botched here
        case 'file': {
            return <FileItem {...(props as ItemProps<ContextItemFile>)} />
        }
        case 'symbol':
            return <SymbolItem {...(props as ItemProps<ContextItemSymbol>)} />
        case 'mixin':
            return <MixinItem {...(props as ItemProps<ContextItemMixin>)} />
    }
    // const item = option.item
    // const isFileType = item.type === 'file'
    // const icon = isFileType ? null : item.kind === 'class' ? 'symbol-structure' : 'symbol-method'
    // const title = item.title ?? (isFileType ? displayPathBasename(item.uri) : item.symbolName)

    // const range = getLineRangeInMention(query, item.range)
    // const dir = displayPathDirname(item.uri)
    // const description = isFileType
    //     ? `${range ? `Lines ${range} · ` : ''}${dir === '.' ? '' : dir}`
    //     : `${displayPath(item.uri)}:${getLineRangeInMention(query, item.range)}`

    // const isLargeFile = isFileType && item.isTooLarge
    // const warning =
    //     isLargeFile && !item.range && !isValidLineRangeQuery(query) ? LARGE_FILE_WARNING_LABEL : ''

    // return (
    //     // biome-ignore lint/a11y/useKeyWithClickEvents:
    //     <li
    //         key={option.key}
    //         tabIndex={-1}
    //         className={classNames(
    //             className,
    //             styles.optionItem,
    //             isSelected && styles.selected,
    //             warning && styles.disabled
    //         )}
    //         ref={option.setRefElement}
    //         // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
    //         role="option"
    //         aria-selected={isSelected}
    //         onMouseEnter={onMouseEnter}
    //         onClick={onClick}
    //     >
    //         <div className={styles.optionItemRow}>
    //             {item.type === 'symbol' && icon && (
    //                 <i className={`codicon codicon-${icon}`} title={item.kind} />
    //             )}
    //             <span
    //                 className={classNames(
    //                     styles.optionItemTitle,
    //                     warning && styles.optionItemTitleWithWarning
    //                 )}
    //             >
    //                 {title}
    //             </span>
    //             {description && <span className={styles.optionItemDescription}>{description}</span>}
    //         </div>
    //         {warning && <span className={styles.optionItemWarning}>{warning}</span>}
    //     </li>
    // )
}

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
            className={classNames(className, styles.optionItem, isSelected && styles.selected)}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            <div className={styles.optionItemRow}>
                <i className={`codicon codicon-${provider.icon}`} title={provider.id} />
                <span className={classNames(styles.optionItemTitle)}>{provider.triggerPrefixes[0]}</span>
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
        const startLine = parseInt(start)
        const endLine = end ? parseInt(end) : Number.POSITIVE_INFINITY
        return `${startLine}-${endLine !== Number.POSITIVE_INFINITY ? endLine : '#'}`
    }
    // Passed in range string if no line number match.
    return range ? displayLineRange(range).toString() : ''
}
