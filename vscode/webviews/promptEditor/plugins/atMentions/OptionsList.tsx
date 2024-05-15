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
    GITHUB_HELP_LABEL,
    IGNORED_FILE_WARNING_LABEL,
    LARGE_FILE_WARNING_LABEL,
    NO_FILE_MATCHES_LABEL,
    NO_GITHUB_MATCHES_LABEL,
    NO_PACKAGE_MATCHES_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    NO_SYMBOL_MATCHES_LABEL,
    PACKAGE_HELP_LABEL,
    SYMBOL_HELP_LABEL,
} from '../../../../src/chat/context/constants'
import { Command, CommandGroup, CommandItem, CommandList } from '../../../components/shadcn/ui/command'
import styles from './OptionsList.module.css'
import type { MentionTypeaheadOption } from './atMentions'

export const OptionsList: FunctionComponent<
    { query: string; options: MentionTypeaheadOption[] } & Pick<
        Parameters<MenuRenderFn<MentionTypeaheadOption>>[1],
        'selectedIndex' | 'setHighlightedIndex' | 'selectOptionAndCleanUp'
    >
> = ({ query, options, selectedIndex, setHighlightedIndex, selectOptionAndCleanUp }) => {
    const ref = useRef<HTMLDivElement>(null)

    // Scroll selected into view. Needs `setTimeout` because we need to wait for all DOM mutations.
    // The `cmdk` package handles this when using its own input, but here we need to use the Lexical
    // editor's input because the user is still typing into the Lexical editor.
    useEffect(() => {
        const timeoutHandle = setTimeout(() => {
            if (ref.current && selectedIndex !== null) {
                const selected = ref.current.querySelector('[aria-selected="true"]')

                if (selected && selected.parentElement?.firstChild === selected) {
                    // First item in Group, ensure heading is in view
                    selected
                        .closest('[cmdk-group=""]')
                        ?.querySelector('[cmdk-group-heading=""]')
                        ?.scrollIntoView({ block: 'nearest' })
                }

                selected?.scrollIntoView({ block: 'nearest' })
            }
        })
        return () => clearTimeout(timeoutHandle)
    }, [selectedIndex])

    const mentionQuery = parseMentionQuery(query, [])

    return (
        <Command
            loop={true}
            shouldFilter={false}
            value={options.at(selectedIndex ?? 0)?.key}
            className={styles.container}
            label="@-mention context"
            ref={ref}
        >
            <CommandList>
                <CommandGroup
                    heading={getHelpText(mentionQuery, options)}
                    forceMount={true}
                    ref={unsetAriaHidden}
                >
                    {options.map((option, i) => (
                        <CommandItem
                            key={option.key}
                            value={option.key}
                            onSelect={() => {
                                setHighlightedIndex(i)
                                selectOptionAndCleanUp(option)
                            }}
                            className={styles.item}
                        >
                            <ItemContent query={mentionQuery} option={option} />
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    )
}

/**
 * Needed for Playwright to consider the element visible. It *is* visible, and the `aria-hidden`
 * attribute is incorrect because the header it's applied to contains important information.
 */
function unsetAriaHidden(element: HTMLDivElement | null): void {
    element?.querySelector('[cmdk-group-heading]')?.removeAttribute('aria-hidden')
}

function getHelpText(mentionQuery: MentionQuery, options: MentionTypeaheadOption[]): string {
    switch (mentionQuery.provider) {
        case 'default':
            return GENERAL_HELP_LABEL
        case 'package':
            return options.length > 0 || mentionQuery.text.length < 3
                ? PACKAGE_HELP_LABEL
                : NO_PACKAGE_MATCHES_LABEL
        case 'github':
            return options.length > 0 ? GITHUB_HELP_LABEL : NO_GITHUB_MATCHES_LABEL
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

const ItemContent: FunctionComponent<{
    query: MentionQuery
    option: MentionTypeaheadOption
}> = ({ query, option }) => {
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
        <div className={styles.optionItem}>
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
        </div>
    )
}
