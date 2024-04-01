import { FloatingPortal, flip, offset, shift, useFloating } from '@floating-ui/react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    $createTextNode,
    COMMAND_PRIORITY_NORMAL,
    KEY_SPACE_COMMAND,
    type LexicalEditor,
    type TextNode,
} from 'lexical'
import { type FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react'
import styles from './atMentions.module.css'

import {
    type ContextItem,
    type RangeData,
    displayPath,
    scanForMentionTriggerInUserTextInput,
} from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import {
    $createContextItemMentionNode,
    $createContextItemTextNode,
} from '../../nodes/ContextItemMentionNode'
import { OptionsList } from './OptionsList'
import { useChatContextItems } from './chatContextClient'

export const RANGE_MATCHES_REGEXP = /:(\d+)?-?(\d+)?$/
export const LINE_RANGE_REGEXP = /:(\d+)-(\d+)$/

/**
 * Parses the line range (if any) at the end of a string like `foo.txt:1-2`. Because this means "all
 * of lines 1 and 2", the returned range actually goes to the start of line 3 to ensure all of line
 * 2 is included. Also, lines in mentions are 1-indexed while `RangeData` is 0-indexed.
 */
export function parseLineRangeInMention(text: string): {
    textWithoutRange: string
    range?: RangeData
} {
    const match = text.match(LINE_RANGE_REGEXP)
    if (match === null) {
        return { textWithoutRange: text }
    }

    let startLine = parseInt(match[1], 10)
    let endLine = parseInt(match[2], 10)
    if (startLine > endLine) {
        // Reverse range so that startLine is always before endLine.
        ;[startLine, endLine] = [endLine, startLine]
    }
    return {
        textWithoutRange: text.slice(0, -match[0].length),
        range: {
            start: { line: startLine - 1, character: 0 },
            end: { line: endLine, character: 0 },
        },
    }
}

const SUGGESTION_LIST_LENGTH_LIMIT = 20

export class MentionTypeaheadOption extends MenuOption {
    public displayPath: string

    constructor(public readonly item: ContextItem) {
        super(
            JSON.stringify([
                `${item.type}`,
                `${item.uri.toString()}`,
                `${item.type === 'symbol' ? item.symbolName : ''}`,
                item.range
                    ? `${item.range.start.line}:${item.range.start.character}-${item.range.end.line}:${item.range.end.character}`
                    : '',
            ])
        )
        this.displayPath = displayPath(item.uri)
    }
}

export default function MentionsPlugin(): JSX.Element | null {
    const [editor] = useLexicalComposerContext()

    const [query, setQuery] = useState<string | null>(null)

    const { x, y, refs, strategy, update } = useFloating({
        placement: 'top-start',
        middleware: [offset(6), flip(), shift()],
    })

    const results = useChatContextItems(query)
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
                const currentInputText = nodeToReplace?.__text
                if (!currentInputText) {
                    return
                }

                const selectedItem = selectedOption.item
                const textNode = $createContextItemTextNode(selectedItem)
                const isLargeFile = selectedItem.type === 'file' && selectedItem.isTooLarge
                // When selecting a large file without range, add the selected option as text and append
                // example range.
                // This allows users to autocomplete the file path, and provide them with
                // the options to make additional changes, e.g. add range, before inserting the mention.
                if (isLargeFile && !selectedItem.range) {
                    nodeToReplace.replace(textNode)
                    const suffix = $createTextNode(':1-10')
                    textNode.insertAfter(suffix)
                    suffix.select()
                    closeMenu()
                    return
                }

                const mentionNode = $createContextItemMentionNode(selectedItem)
                nodeToReplace?.replace(mentionNode)
                const spaceAfter = $createTextNode(' ')
                mentionNode.insertAfter(spaceAfter)
                spaceAfter.select()
                closeMenu()
            })
        },
        [editor]
    )

    const onQueryChange = useCallback((query: string | null) => setQuery(query), [])

    return (
        <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
            onQueryChange={onQueryChange}
            onSelectOption={onSelectOption}
            triggerFn={scanForMentionTriggerInUserTextInput}
            options={options}
            anchorClassName={styles.resetAnchor}
            commandPriority={
                COMMAND_PRIORITY_NORMAL /* so Enter keypress selects option and doesn't submit form */
            }
            onOpen={menuResolution => {
                refs.setPositionReference({
                    getBoundingClientRect: menuResolution.getRect,
                })
            }}
            menuRenderFn={(
                anchorElementRef,
                { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
            ) =>
                anchorElementRef.current && (
                    <>
                        <SpaceKeyTrigger
                            editor={editor}
                            options={options}
                            selectedIndex={selectedIndex}
                            selectOptionAndCleanUp={selectOptionAndCleanUp}
                        />
                        <FloatingPortal root={anchorElementRef.current}>
                            <div
                                ref={refs.setFloating}
                                style={{
                                    position: strategy,
                                    top: y ?? 0,
                                    left: x ?? 0,
                                    width: 'max-content',
                                }}
                                className={classNames(styles.popover)}
                            >
                                <OptionsList
                                    query={query ?? ''}
                                    options={options}
                                    selectedIndex={selectedIndex}
                                    setHighlightedIndex={setHighlightedIndex}
                                    selectOptionAndCleanUp={selectOptionAndCleanUp}
                                />
                            </div>
                        </FloatingPortal>
                    </>
                )
            }
        />
    )
}

/**
 * Makes it so that typing <Space> also triggers selection of the option (just like Enter and Tab).
 */
const SpaceKeyTrigger: FunctionComponent<{
    editor: LexicalEditor
    options: MentionTypeaheadOption[]
    selectedIndex: number | null
    selectOptionAndCleanUp: (option: MentionTypeaheadOption) => void
}> = ({ editor, options, selectedIndex, selectOptionAndCleanUp }) => {
    useEffect(() => {
        return editor.registerCommand(
            KEY_SPACE_COMMAND,
            (event: KeyboardEvent | null) => {
                if (options === null || selectedIndex === null || options[selectedIndex] == null) {
                    return false
                }
                if (event !== null) {
                    event.preventDefault()
                    event.stopImmediatePropagation()
                }
                selectOptionAndCleanUp(options[selectedIndex])
                return true
            },
            COMMAND_PRIORITY_NORMAL
        )
    }, [editor, options, selectedIndex, selectOptionAndCleanUp])
    return null
}
