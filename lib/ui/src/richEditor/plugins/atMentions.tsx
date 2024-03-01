import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
    LexicalTypeaheadMenuPlugin,
    MenuOption,
    type MenuTextMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { TextNode } from 'lexical'
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as ReactDOM from 'react-dom'
import styles from './atMentions.module.css'

import classNames from 'classnames'
import { $createMentionNode } from '../nodes/MentionNode'

const PUNCTUATION = '\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%\'"~=<>_:;'
const NAME = '\\b[A-Z][^\\s' + PUNCTUATION + ']'

const DocumentMentionsRegex = {
    NAME,
    PUNCTUATION,
}

const PUNC = DocumentMentionsRegex.PUNCTUATION

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
        '((?:' +
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

// At most, 5 suggestions are shown in the popup.
const SUGGESTION_LIST_LENGTH_LIMIT = 10

const mentionsCache = new Map()

const dummyMentionsData = [
    'Aayla Secura',
    'Adi Gallia',
    'Wollivan',
    'Wuher',
    'Wullf Yularen',
    'Xamuel Lennox',
    'Yaddle',
    'Yarael Poof',
    'Yoda',
    'Zam Wesell',
    'Zev Senesca',
    'Ziro the Hutt',
    'Zuckuss',
]

const dummyLookupService = {
    search(string: string, callback: (results: Array<string>) => void): void {
        setTimeout(() => {
            const results = dummyMentionsData.filter(mention =>
                mention.toLowerCase().includes(string.toLowerCase())
            )
            callback(results)
        }, 250)
    },
}

function useMentionLookupService(mentionString: string | null) {
    const [results, setResults] = useState<Array<string>>([])

    useEffect(() => {
        const cachedResults = mentionsCache.get(mentionString)

        if (mentionString == null) {
            setResults([])
            return
        }

        if (cachedResults === null) {
            return
        }
        if (cachedResults !== undefined) {
            setResults(cachedResults)
            return
        }

        mentionsCache.set(mentionString, null)
        dummyLookupService.search(mentionString, newResults => {
            mentionsCache.set(mentionString, newResults)
            setResults(newResults)
        })
    }, [mentionString])

    return results
}

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
    return checkForAtSignMentions(text, 1)
}

class MentionTypeaheadOption extends MenuOption {
    name: string

    constructor(name: string) {
        super(name)
        this.name = name
    }
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
    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={isSelected ? styles.selected : ''}
            ref={option.setRefElement}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: This element is interactive, in a dropdown list.
            role="option"
            aria-selected={isSelected}
            id={'typeahead-item-' + index}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
        >
            {option.name}
        </li>
    )
}

export default function MentionsPlugin(): JSX.Element | null {
    const [editor] = useLexicalComposerContext()

    const [queryString, setQueryString] = useState<string | null>(null)

    const results = useMentionLookupService(queryString)

    const options = useMemo(
        () =>
            results
                .map(result => new MentionTypeaheadOption(result))
                .slice(0, SUGGESTION_LIST_LENGTH_LIMIT),
        [results]
    )

    const onSelectOption = useCallback(
        (
            selectedOption: MentionTypeaheadOption,
            nodeToReplace: TextNode | null,
            closeMenu: () => void
        ) => {
            editor.update(() => {
                const mentionNode = $createMentionNode(selectedOption.name)
                if (nodeToReplace) {
                    nodeToReplace.replace(mentionNode)
                }
                mentionNode.select()
                closeMenu()
            })
        },
        [editor]
    )

    return (
        <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
            onQueryChange={setQueryString}
            onSelectOption={onSelectOption}
            triggerFn={getPossibleQueryMatch}
            options={options}
            menuRenderFn={(
                anchorElementRef,
                { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
            ) =>
                anchorElementRef.current && results.length
                    ? ReactDOM.createPortal(
                          <div className={classNames(styles.typeaheadPopover, styles.mentionsMenu)}>
                              <ul>
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
                          </div>,
                          anchorElementRef.current
                      )
                    : null
            }
        />
    )
}
