import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
    $getNodeByKey,
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
    KEY_DOWN_COMMAND,
    type LexicalEditor,
    type NodeKey,
} from 'lexical'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { getGlobalPromptEditorConfig } from '../config'
import { $isTemplateInputNode, type TemplateInputNode } from './TemplateInputNode'
import { useIsFocused } from './mentionUtils'

export const TemplateInputComponent: React.FC<{
    editor: LexicalEditor
    nodeKey: NodeKey
    node: TemplateInputNode
    className: string
    focusedClassName: string
}> = ({ editor, nodeKey, node, className, focusedClassName }) => {
    const { tooltipComponents } = getGlobalPromptEditorConfig()

    const isEditorFocused = useIsFocused()
    const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
    const ref = useRef<HTMLSpanElement>(null)

    const composedClassNames = useMemo(() => {
        const classes = [className]
        if (isSelected && isEditorFocused) {
            classes.push(focusedClassName)
        }
        return classes.join(' ').trim()
    }, [isSelected, className, focusedClassName, isEditorFocused])

    // Clicking will select the component.
    const onClick = useCallback(
        (event: MouseEvent) => {
            if (event.target === ref.current || ref.current?.contains(event.target as Node)) {
                if (!event.shiftKey) {
                    clearSelection()
                }
                setSelected(true)

                return true
            }
            return false
        },
        [clearSelection, setSelected]
    )

    // Inserting text on a selected component will replace it.
    const onKeyDown = useCallback(
        (_event: KeyboardEvent) => {
            // This will replace on any keypress, including modifier
            // keys, tab, etc. I could not get Lexical to work with
            // its CONTROLLED_TEXT_INSERTION_COMMAND (or any other)
            // to reliably detect text insertion. So instead we
            // over-eagerly do replace.
            if (isSelected) {
                editor.update(() => {
                    const node = $getNodeByKey(nodeKey)
                    if (!$isTemplateInputNode(node)) {
                        return
                    }
                    const next = node.getNextSibling()
                    node.remove()
                    next?.selectStart()
                })
            }
            return false
        },
        [nodeKey, editor, isSelected]
    )

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_DOWN_COMMAND, onKeyDown, COMMAND_PRIORITY_LOW)
        )
    }, [editor, onClick, onKeyDown])

    const tooltip = 'replaces template placeholder on keypress'
    const text = node.templateInput.placeholder

    const content = (
        <span ref={ref} className={composedClassNames} title={tooltipComponents ? undefined : tooltip}>
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
