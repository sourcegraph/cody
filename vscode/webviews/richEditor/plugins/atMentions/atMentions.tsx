import { FloatingPortal, flip, offset, shift, useFloating } from '@floating-ui/react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
    LexicalTypeaheadMenuPlugin,
    MenuOption,
    type MenuRenderFn,
    type MenuTextMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { TextNode } from 'lexical'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './atMentions.module.css'

import { type ContextFile, displayPath } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import { $createMentionNode } from '../../nodes/MentionNode'
import { useChatContextClient } from './chatContextClient'

const PUNCTUATION = '\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%\'"~=<>_:;'

const ItemMentionsRegex = {
    PUNCTUATION,
}

const PUNC = ItemMentionsRegex.PUNCTUATION

const TRIGGERS = ['@'].join('')

// Chars we expect to see in a mention (non-space, non-punctuation).
const VALID_CHARS = '[^' + TRIGGERS + PUNC + '\\s]'

// Non-standard series of chars. Each series must be preceded and followed by
// a valid char.
const VALID_JOINS =
    '(?:' +
    '\\.[ |$]|' + // E.g. "r. " in "Mr. Smith"
    ' |' + // E.g. " " in "Josh Duck"
    '[' +
    PUNC +
    ']|' + // E.g. "-' in "Salier-Hellendag"
    ')'

const LENGTH_LIMIT = 75

const AtSignMentionsRegex = new RegExp(
    '(^|\\s|\\()(' +
        '[' +
        TRIGGERS +
        ']' +
        '(#(?:' +
        VALID_CHARS +
        VALID_JOINS +
        '){0,' +
        LENGTH_LIMIT +
        '})' +
        ')$'
)

// 50 is the longest alias length limit.
const ALIAS_LENGTH_LIMIT = 50

// Regex used to match alias.
const AtSignMentionsRegexAliasRegex = new RegExp(
    '(^|\\s|\\()(' +
        '[' +
        TRIGGERS +
        ']' +
        '((?:' +
        VALID_CHARS +
        '){0,' +
        ALIAS_LENGTH_LIMIT +
        '})' +
        ')$'
)

const SUGGESTION_LIST_LENGTH_LIMIT = 20

function checkForAtSignMentions(text: string, minMatchLength: number): MenuTextMatch | null {
    let match = AtSignMentionsRegex.exec(text)

    if (match === null) {
        match = AtSignMentionsRegexAliasRegex.exec(text)
    }
    if (match !== null) {
        // The strategy ignores leading whitespace but we need to know it's
        // length to add it to the leadOffset
        const maybeLeadingWhitespace = match[1]

        const matchingString = match[3]
        if (matchingString.length >= minMatchLength) {
            return {
                leadOffset: match.index + maybeLeadingWhitespace.length,
                matchingString,
                replaceableString: match[2],
            }
        }
    }
    return null
}

function getPossibleQueryMatch(text: string): MenuTextMatch | null {
    return checkForAtSignMentions(text, 0)
}

class MentionTypeaheadOption extends MenuOption {
    public displayPath: string // TODO(sqs)

    constructor(public readonly item: ContextFile) {
        super(`${item.type}:${item.uri.toString()}`)
        this.displayPath = displayPath(item.uri)
    }
}

export function toOptions(items: ContextFile[]): MentionTypeaheadOption[] {
    return items.map(item => new MentionTypeaheadOption(item))
}

function MentionsTypeaheadMenuItem({
    index,
    isSelected,
    onClick,
    onMouseEnter,
    option,
}: {
    index: number
    isSelected: boolean
    onClick: () => void
    onMouseEnter: () => void
    option: MentionTypeaheadOption
}) {
    const item = option.item
    const icon =
        item.type === 'file' ? null : item.kind === 'class' ? 'symbol-structure' : 'symbol-method'
    const title = item.type === 'file' ? displayPath(item.uri) : item.symbolName
    const range = item.range ? `:${item.range.start.line + 1}-${item.range.end.line + 1}` : ''
    const description = item.type === 'file' ? undefined : displayPath(item.uri) + range
    const warning =
        item.type === 'file' && item.title === 'large-file'
            ? 'File too large. Type @# to choose a symbol.'
            : undefined
    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={classNames(styles.item, styles.optionItem, isSelected && styles.selected)}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            id={'typeahead-item-' + index}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
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
            {warning && <span className={styles.optionItemWarning}>{warning}</span>}
        </li>
    )
}

export default function MentionsPlugin(): JSX.Element | null {
    const [editor] = useLexicalComposerContext()

    const [query, setQuery] = useState('')

    const { x, y, refs, strategy, update } = useFloating({
        placement: 'top-start',
        middleware: [offset(6), flip(), shift()],
    })

    const chatContextClient = useChatContextClient()
    const [results, setResults] = useState<ContextFile[]>()
    useEffect(() => {
        // Track if the query changed since this request was sent (which would make our results
        // no longer valid).
        let invalidated = false

        if (chatContextClient) {
            chatContextClient
                .getChatContextItems(query)
                .then(mentions => {
                    if (invalidated) {
                        return
                    }
                    setResults(mentions)
                })
                .catch(error => {
                    setResults(undefined)
                    console.error(error)
                })
        }

        return () => {
            invalidated = true
        }
    }, [chatContextClient, query])
    const options = useMemo(
        () =>
            results
                ?.map(result => new MentionTypeaheadOption(result))
                .slice(0, SUGGESTION_LIST_LENGTH_LIMIT) ?? [],
        [results]
    )
    // biome-ignore lint/correctness/useExhaustiveDependencies: Intent is to update whenever `options` changes.
    useEffect(() => {
        update()
    }, [options, update])

    const onSelectOption = useCallback(
        (
            selectedOption: MentionTypeaheadOption,
            nodeToReplace: TextNode | null,
            closeMenu: () => void
        ) => {
            editor.update(() => {
                const mentionNode = $createMentionNode(selectedOption.displayPath)
                if (nodeToReplace) {
                    nodeToReplace.replace(mentionNode)
                }
                mentionNode.select()
                closeMenu()
            })
        },
        [editor]
    )

    const onQueryChange = useCallback((query: string | null) => setQuery(query ?? ''), [])

    return (
        <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
            onQueryChange={onQueryChange}
            onSelectOption={onSelectOption}
            triggerFn={getPossibleQueryMatch}
            options={options}
            anchorClassName={styles.resetAnchor}
            onOpen={menuResolution => {
                refs.setPositionReference({
                    getBoundingClientRect: menuResolution.getRect,
                })
            }}
            menuRenderFn={(
                anchorElementRef,
                { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
            ) =>
                anchorElementRef.current && options.length > 0 ? (
                    <FloatingPortal root={anchorElementRef.current}>
                        <div
                            ref={refs.setFloating}
                            style={{
                                position: strategy,
                                top: y ?? 0,
                                left: x ?? 0,
                                width: 'max-content',
                            }}
                            className={classNames(styles.typeaheadPopover, styles.mentionsMenu)}
                        >
                            <OptionsList
                                query={query}
                                options={options}
                                selectedIndex={selectedIndex}
                                setHighlightedIndex={setHighlightedIndex}
                                selectOptionAndCleanUp={selectOptionAndCleanUp}
                            />
                        </div>
                    </FloatingPortal>
                ) : null
            }
        />
    )
}

export const OptionsList: React.FunctionComponent<
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
    return (
        <ul ref={ref}>
            <li role="note" className={classNames(styles.item, styles.helpItem)}>
                {query === ''
                    ? 'Search for a file to include, or type # for symbols...'
                    : query.startsWith('#')
                      ? 'Search for a symbol to include...'
                      : 'Search for a file to include...'}
            </li>
            {options.map((option, i) => (
                <MentionsTypeaheadMenuItem
                    index={i}
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
                />
            ))}
        </ul>
    )
}
