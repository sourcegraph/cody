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
        const validIndex = options.findIndex(o => o?.item?.type === 'file' && !o?.item?.isTooLarge)
        setHighlightedIndex(validIndex < 0 ? 0 : validIndex)
    }, [options])

    // biome-ignore lint/correctness/useExhaustiveDependencies: Intent is to run whenever `selectedIndex` changes.
    useEffect(() => {
        if (selectedIndex === null) {
            return
        }
        // If the selectedIndex isTooLarge, set it to the next valid option.
        const current = options[selectedIndex]
        const currentOptionIsInvalid = current?.item?.type === 'file' && current?.item?.isTooLarge
        if (currentOptionIsInvalid) {
            const validIndex = options.findIndex(
                (o, i) => i > selectedIndex && o?.item?.type === 'file' && !o?.item?.isTooLarge
            )
            setHighlightedIndex(validIndex)
        }
    }, [selectedIndex])

    const mentionQuery = parseMentionQuery(query)

    return (
        <div className={styles.container}>
            <h3 className={classNames(styles.item, styles.helpItem)}>
                {mentionQuery.type === 'empty'
                    ? 'Search for a file to include, or type # for symbols...'
                    : mentionQuery.type === 'symbol'
                      ? options.length > 0
                            ? 'Search for a symbol to include...'
                            : `No symbols found${
                                  mentionQuery.text.length <= 2
                                      ? ' (try installing language extensions and opening a file)'
                                      : ''
                              }`
                      : options.length > 0
                          ? 'Search for a file to include...'
                          : 'No files found'}
                <br />
            </h3>
            {options.length > 0 && (
                <ul ref={ref} className={styles.list}>
                    {options.map((option, i) => (
                        <Item
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
    isSelected: boolean
    onClick: () => void
    onMouseEnter: () => void
    option: MentionTypeaheadOption
    className?: string
}> = ({ isSelected, onClick, onMouseEnter, option, className }) => {
    const item = option.item
    const icon =
        item.type === 'file' ? null : item.kind === 'class' ? 'symbol-structure' : 'symbol-method'
    const title = item.title ?? (item.type === 'file' ? displayPathBasename(item.uri) : item.symbolName)
    const range = item.range ? displayLineRange(item.range) : ''
    const dirname = displayPathDirname(item.uri)
    const description =
        item.type === 'file'
            ? `${range ? `Lines ${range} · ` : ''}${dirname === '.' ? '' : dirname}`
            : displayPath(item.uri) + `:${range}`
    const warning =
        item.type === 'file' && item.isTooLarge
            ? 'File too large. Type @# to choose a symbol.'
            : undefined

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents:
        <li
            key={option.key}
            tabIndex={-1}
            className={classNames(
                className,
                styles.optionItem,
                isSelected && !warning && styles.selected,
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
