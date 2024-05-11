import { FloatingPortal, flip, offset, shift, useFloating } from '@floating-ui/react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $createTextNode, COMMAND_PRIORITY_NORMAL, type TextNode } from 'lexical'
import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './atMentions.module.css'

import {
    type ContextItem,
    ContextItemSource,
    FAST_CHAT_INPUT_TOKEN_BUDGET,
    displayPath,
    scanForMentionTriggerInUserTextInput,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { useCurrentChatModel } from '../../../chat/models/chatModelContext'
import { toSerializedPromptEditorValue } from '../../PromptEditor'
import {
    $createContextItemMentionNode,
    $createContextItemTextNode,
    ContextItemMentionNode,
} from '../../nodes/ContextItemMentionNode'
import { OptionsList } from './OptionsList'
import { useChatContextItems } from './chatContextClient'

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

    const [tokenAdded, setTokenAdded] = useState<number>(0)

    const { x, y, refs, strategy, update } = useFloating({
        placement: 'top-start',
        middleware: [offset(6), flip(), shift()],
    })

    const results = useChatContextItems(query)

    const model = useCurrentChatModel()
    const options = useMemo(() => {
        const limit =
            model?.contextWindow?.context?.user ||
            model?.contextWindow?.input ||
            FAST_CHAT_INPUT_TOKEN_BUDGET
        return (
            results
                ?.map(r => {
                    if (r.size) {
                        r.isTooLarge = r.size > limit - tokenAdded
                    }
                    // All @-mentions should have a source of `User`.
                    r.source = ContextItemSource.User
                    return new MentionTypeaheadOption(r)
                })
                .slice(0, SUGGESTION_LIST_LENGTH_LIMIT) ?? []
        )
    }, [results, model, tokenAdded])

    // biome-ignore lint/correctness/useExhaustiveDependencies: Intent is to update whenever `options` changes.
    useEffect(() => {
        update()
    }, [options, update])

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
                const isLargeFile = selectedItem.isTooLarge
                // When selecting a large file without range, add the selected option as text node with : at the end.
                // This allows users to autocomplete the file path, and provide them with the options to add range.
                if (isLargeFile && !selectedItem.range) {
                    const textNode = $createContextItemTextNode(selectedItem)
                    nodeToReplace.replace(textNode)
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
                    <FloatingPortal root={anchorElementRef.current}>
                        <div
                            ref={refs.setFloating}
                            style={{
                                position: strategy,
                                top: y ?? 0,
                                left: x ?? 0,
                                width: 'max-content',
                            }}
                            className={clsx(styles.popover)}
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
                )
            }
        />
    )
}
