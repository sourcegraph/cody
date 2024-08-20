import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, type MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
    $createTextNode,
    $getSelection,
    $isTextNode,
    BLUR_COMMAND,
    COMMAND_PRIORITY_NORMAL,
    KEY_ESCAPE_COMMAND,
    type TextNode,
} from 'lexical'
import { isEqual } from 'lodash'
import { type FunctionComponent, memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './atMentions.module.css'

import {
    type ContextItem,
    scanForMentionTriggerInUserTextInput,
    toSerializedPromptEditorValue,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { MentionMenu } from '../../mentions/mentionMenu/MentionMenu'
import { useMentionMenuData, useMentionMenuParams } from '../../mentions/mentionMenu/useMentionMenuData'
import {
    $createContextItemMentionNode,
    $createContextItemTextNode,
    ContextItemMentionNode,
} from '../../nodes/ContextItemMentionNode'
import { contextItemID } from './util'

const SUGGESTION_LIST_LENGTH_LIMIT = 20

export interface MentionMenuOption extends MenuOption {
    item: ContextItem
}

export function createMentionMenuOption(item: ContextItem): MentionMenuOption {
    return {
        item,
        key: contextItemID(item),

        // This is not used by LexicalMenu or LexicalTypeaheadMenuPlugin, so we can just make it a
        // noop.
        setRefElement: () => {},
    }
}

/**
 * We allow whitespace for @-mentions in the Lexical editor because
 * it has an explicit switch between modes and can render @-mentions
 * as special nodes that can be detected in later edits.
 *
 * The Edit quick-pick menu uses a raw text input and lacks this functionality,
 * so we rely on spaces to detect @-mentions and switch between @-item selection
 * and regular text input.
 */
function scanForMentionTriggerInLexicalInput(text: string) {
    return scanForMentionTriggerInUserTextInput({ textBeforeCursor: text, includeWhitespace: true })
}

export type setEditorQuery = (getNewQuery: (currentText: string) => [string, number?]) => void

export const MentionsPlugin: FunctionComponent<{ contextWindowSizeInTokens?: number }> = memo(
    ({ contextWindowSizeInTokens }) => {
        const [editor] = useLexicalComposerContext()

        /**
         * Total sum of tokens represented by all of the @-mentioned items.
         */
        const [tokenAdded, setTokenAdded] = useState<number>(0)

        const remainingTokenBudget =
            contextWindowSizeInTokens === undefined
                ? Number.MAX_SAFE_INTEGER
                : contextWindowSizeInTokens - tokenAdded

        const { params, updateQuery, updateMentionMenuParams } = useMentionMenuParams()

        const data = useMentionMenuData(params, {
            remainingTokenBudget,
            limit: SUGGESTION_LIST_LENGTH_LIMIT,
        })

        const setEditorQuery = useCallback<setEditorQuery>(
            getNewQuery => {
                if (editor) {
                    editor.update(() => {
                        const node = $getSelection()?.getNodes().at(-1)
                        if (!node || !$isTextNode(node)) {
                            return
                        }

                        const currentText = node.getTextContent()
                        const [newText, index] = getNewQuery(currentText)
                        if (currentText === newText) {
                            return
                        }

                        node.setTextContent(newText)

                        if (index !== undefined) {
                            node.select(index, index)
                        } else {
                            // If our old text was "prefix @bar baz" and the new text is
                            // "prefix @ baz" then our cursor should be just after @
                            // (which is at the common prefix position)
                            const offset = sharedPrefixLength(currentText, newText)
                            node.select(offset, offset)
                        }
                    })
                }
            },
            [editor]
        )

        useEffect(() => {
            // Listen for changes to ContextItemMentionNode to update the token count.
            // This updates the token count when a mention is added or removed.
            const unregister = editor.registerMutationListener(ContextItemMentionNode, node => {
                const items = toSerializedPromptEditorValue(editor)?.contextItems
                if (!items?.length) {
                    setTokenAdded(0)
                    return
                }
                setTokenAdded(items?.reduce((acc, item) => acc + (item.size ? item.size : 0), 0) ?? 0)
            })
            return unregister
        }, [editor])

        const onSelectOption = useCallback(
            (
                selectedOption: MentionMenuOption,
                nodeToReplace: TextNode | null,
                closeMenu: () => void
            ) => {
                editor.update(() => {
                    const currentInputText = nodeToReplace?.__text
                    if (!currentInputText) {
                        return
                    }

                    const selectedItem = selectedOption.item
                    const isLargeFile = selectedItem.isTooLarge
                    // When selecting a large file without range, add the selected option as text node with : at the end.
                    // This allows users to autocomplete the file path, and provide them with the options to add range.
                    if (isLargeFile && !selectedItem.range) {
                        const textNode = $createContextItemTextNode(selectedItem)
                        nodeToReplace.replace(textNode)

                        // Keep at symbol because we're still in the editing mode
                        // (since ranges haven't been presented yet)
                        textNode.insertBefore($createTextNode('@'))

                        const colonNode = $createTextNode(':')
                        textNode.insertAfter(colonNode)

                        colonNode.select()
                    } else {
                        const mentionNode = $createContextItemMentionNode(selectedItem)
                        nodeToReplace.replace(mentionNode)
                        const spaceNode = $createTextNode(' ')
                        mentionNode.insertAfter(spaceNode)
                        spaceNode.select()
                    }
                    closeMenu()
                })
            },
            [editor]
        )

        // Close the menu when the editor loses focus.
        const anchorElementRef2 = useRef<HTMLElement>()
        useEffect(() => {
            return editor.registerCommand(
                BLUR_COMMAND,
                event => {
                    // Ignore clicks in the mention menu itself.
                    const isInEditorOrMenu = Boolean(
                        event.relatedTarget instanceof Node &&
                            (editor.getRootElement()?.contains(event.relatedTarget) ||
                                anchorElementRef2.current?.contains(event.relatedTarget))
                    )
                    if (isInEditorOrMenu) {
                        // `editor.focus()` swallows clicks in the menu; this seems to work instead.
                        editor.getRootElement()?.focus()
                        return true
                    }

                    editor.dispatchCommand(
                        KEY_ESCAPE_COMMAND,
                        new KeyboardEvent('keydown', { key: 'Escape' })
                    )
                    return true
                },
                COMMAND_PRIORITY_NORMAL
            )
        }, [editor])

        const onClose = useCallback(() => {
            updateMentionMenuParams({ parentItem: null })
        }, [updateMentionMenuParams])

        return (
            <LexicalTypeaheadMenuPlugin<MentionMenuOption>
                onQueryChange={updateQuery}
                onSelectOption={onSelectOption}
                onClose={onClose}
                triggerFn={scanForMentionTriggerInLexicalInput}
                options={DUMMY_OPTIONS}
                commandPriority={
                    COMMAND_PRIORITY_NORMAL /* so Enter keypress selects option and doesn't submit form */
                }
                menuRenderFn={(anchorElementRef, itemProps) => {
                    const { selectOptionAndCleanUp } = itemProps
                    anchorElementRef2.current = anchorElementRef.current ?? undefined
                    return (
                        anchorElementRef.current &&
                        createPortal(
                            // Use an outer container that is always the same height, which is the
                            // max height of the visible menu. This ensures that the menu does not
                            // flip orientation as the user is typing if it suddenly has less
                            // results. It also makes the positioning less glitchy.
                            <div data-at-mention-menu="" className={clsx(styles.popoverDimensions)}>
                                <div className={styles.popover}>
                                    <MentionMenu
                                        params={params}
                                        updateMentionMenuParams={updateMentionMenuParams}
                                        setEditorQuery={setEditorQuery}
                                        data={data}
                                        selectOptionAndCleanUp={selectOptionAndCleanUp}
                                    />
                                </div>
                            </div>,
                            anchorElementRef.current
                        )
                    )
                }}
            />
        )
    },
    isEqual
)

function sharedPrefixLength(s1: string, s2: string): number {
    let i = 0
    while (i < s1.length && i < s2.length && s1[i] === s2[i]) {
        i += 1
    }
    return i
}

/**
 * Dummy options for LexicalTypeaheadMenuPlugin. See {@link MentionMenu} for an explanation of why
 * we handle options ourselves.
 */
const DUMMY_OPTIONS: MentionMenuOption[] = []
