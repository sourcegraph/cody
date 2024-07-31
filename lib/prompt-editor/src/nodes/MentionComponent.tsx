import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
    $getNodeByKey,
    $getSelection,
    $isDecoratorNode,
    $isElementNode,
    $isNodeSelection,
    $isTextNode,
    $setSelection,
    BLUR_COMMAND,
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
    KEY_ARROW_LEFT_COMMAND,
    KEY_ARROW_RIGHT_COMMAND,
    KEY_BACKSPACE_COMMAND,
    KEY_DELETE_COMMAND,
    type NodeKey,
    SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { type FunctionComponent, useCallback, useEffect, useMemo, useRef } from 'react'
import { getGlobalPromptEditorConfig } from '../config'
import { $isContextItemMentionNode, type ContextItemMentionNode } from './ContextItemMentionNode'
import { IS_IOS, useIsFocused } from './mentionUtils'

export const MentionComponent: FunctionComponent<{
    nodeKey: NodeKey
    node: ContextItemMentionNode
    tooltip?: string
    icon?: React.ComponentType<{
        size?: string | number
        strokeWidth?: string | number
        className?: string
    }>
    className?: string
    focusedClassName?: string
    iconClassName?: string
}> = ({ nodeKey, node, tooltip, icon: Icon, className, focusedClassName, iconClassName }) => {
    const { tooltipComponents, onContextItemMentionNodeMetaClick } = getGlobalPromptEditorConfig()

    const [editor] = useLexicalComposerContext()
    const isEditorFocused = useIsFocused()
    const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
    const ref = useRef<any>(null)

    const text = node.getTextContent()

    const composedClassNames = useMemo(() => {
        if (className) {
            const classes = [className]
            if (isSelected && isEditorFocused && focusedClassName) {
                classes.push(focusedClassName)
            }
            return classes.join(' ').trim() || undefined
        }
        return ''
    }, [isSelected, className, focusedClassName, isEditorFocused])

    const onDelete = useCallback(
        (payload: KeyboardEvent) => {
            if (isSelected && $isNodeSelection($getSelection())) {
                payload.preventDefault()
                const node = $getNodeByKey(nodeKey)
                if ($isContextItemMentionNode(node)) {
                    node.remove()
                }
            }
            return false
        },
        [isSelected, nodeKey]
    )

    const onArrowLeftPress = useCallback(
        (event: KeyboardEvent) => {
            const node = $getNodeByKey(nodeKey)
            if (!node || !node.isSelected()) {
                return false
            }
            let handled = false
            const nodeToSelect = node.getPreviousSibling()
            if ($isElementNode(nodeToSelect)) {
                nodeToSelect.selectEnd()
                handled = true
            }
            if ($isTextNode(nodeToSelect)) {
                nodeToSelect.select()
                handled = true
            }
            if ($isDecoratorNode(nodeToSelect)) {
                nodeToSelect.selectNext()
                handled = true
            }
            if (nodeToSelect === null) {
                node.selectPrevious()
                handled = true
            }
            if (handled) {
                event.preventDefault()
            }
            return handled
        },
        [nodeKey]
    )

    const onArrowRightPress = useCallback(
        (event: KeyboardEvent) => {
            const node = $getNodeByKey(nodeKey)
            if (!node || !node.isSelected()) {
                return false
            }
            let handled = false
            const nodeToSelect = node.getNextSibling()
            if ($isElementNode(nodeToSelect)) {
                nodeToSelect.selectStart()
                handled = true
            }
            if ($isTextNode(nodeToSelect)) {
                nodeToSelect.select(0, 0)
                handled = true
            }
            if ($isDecoratorNode(nodeToSelect)) {
                nodeToSelect.selectPrevious()
                handled = true
            }
            if (nodeToSelect === null) {
                node.selectNext()
                handled = true
            }
            if (handled) {
                event.preventDefault()
            }
            return handled
        },
        [nodeKey]
    )

    const onClick = useCallback(
        (event: MouseEvent) => {
            if (event.target === ref.current || ref.current?.contains(event.target as Node)) {
                if (!event.shiftKey) {
                    clearSelection()
                }
                setSelected(true)

                // metaKey is true when you press cmd on Mac while clicking.
                if (event.metaKey) {
                    onContextItemMentionNodeMetaClick?.(node.contextItem)
                }

                return true
            }
            return false
        },
        [clearSelection, setSelected, onContextItemMentionNodeMetaClick, node.contextItem]
    )

    const onBlur = useCallback(() => {
        const node = $getNodeByKey(nodeKey)
        if (!node || !node.isSelected()) {
            return false
        }

        const selection = $getSelection()
        if (!$isNodeSelection(selection)) {
            return false
        }

        $setSelection(null)
        return false
    }, [nodeKey])

    const onSelectionChange = useCallback(() => {
        if (IS_IOS && isSelected) {
            // Needed to keep the cursor in the editor when clicking next to a selected mention.
            setSelected(false)
            return true
        }
        return false
    }, [isSelected, setSelected])

    useEffect(() => {
        const unregister = mergeRegister(
            editor.registerCommand<MouseEvent>(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_ARROW_LEFT_COMMAND, onArrowLeftPress, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, onArrowRightPress, COMMAND_PRIORITY_LOW),
            editor.registerCommand(BLUR_COMMAND, onBlur, COMMAND_PRIORITY_LOW),
            editor.registerCommand(SELECTION_CHANGE_COMMAND, onSelectionChange, COMMAND_PRIORITY_LOW)
        )
        return () => {
            unregister()
        }
    }, [editor, onArrowLeftPress, onArrowRightPress, onClick, onDelete, onBlur, onSelectionChange])

    const content = (
        <span ref={ref} className={composedClassNames} title={tooltipComponents ? undefined : tooltip}>
            {Icon && <Icon size={14} strokeWidth={2} className={iconClassName} />}
            <span>{text}</span>
        </span>
    )

    if (!tooltipComponents) {
        return content
    }
    const { Tooltip, TooltipContent, TooltipTrigger } = tooltipComponents
    return (
        <Tooltip>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
            {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
        </Tooltip>
    )
}
