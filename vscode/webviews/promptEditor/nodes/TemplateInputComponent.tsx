import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
    $getNodeByKey,
    $getSelection,
    $isNodeSelection,
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
    KEY_BACKSPACE_COMMAND,
    KEY_DELETE_COMMAND,
    KEY_ENTER_COMMAND,
    type NodeKey,
    SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/shadcn/ui/tooltip'
import { $isTemplateInputNode, type TemplateInputNode } from './TemplateInputNode'
import { useIsFocused } from './mentionUtils'

export const TemplateInputComponent: React.FC<{
    nodeKey: NodeKey
    node: TemplateInputNode
    className?: string
    focusedClassName?: string
}> = ({ nodeKey, node, className, focusedClassName }) => {
    const [editor] = useLexicalComposerContext()
    const isEditorFocused = useIsFocused()
    const [isSelected] = useLexicalNodeSelection(nodeKey)
    const ref = useRef<HTMLSpanElement>(null)

    const composedClassNames = useMemo(() => {
        const classes = [className]
        if (isSelected && isEditorFocused && focusedClassName) {
            classes.push(focusedClassName)
        }
        return classes.join(' ').trim() || undefined
    }, [isSelected, className, focusedClassName, isEditorFocused])

    const handleDelete = useCallback(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isTemplateInputNode(node)) {
            node.remove()
        }
    }, [nodeKey])

    const onDelete = useCallback(
        (event: KeyboardEvent) => {
            if (isSelected && $isNodeSelection($getSelection())) {
                event.preventDefault()
                handleDelete()
                return true
            }
            return false
        },
        [isSelected, handleDelete]
    )

    const onClick = useCallback(
        (event: MouseEvent) => {
            if (event.target === ref.current || ref.current?.contains(event.target as Node)) {
                event.preventDefault()
                handleDelete()
                return true
            }
            return false
        },
        [handleDelete]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
                event.preventDefault()
                handleDelete()
            }
        },
        [handleDelete]
    )

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    return false
                },
                COMMAND_PRIORITY_LOW
            ),
            editor.registerCommand(
                KEY_ENTER_COMMAND,
                event => {
                    if (isSelected) {
                        onKeyDown(event as unknown as React.KeyboardEvent<HTMLInputElement>)
                        return true
                    }
                    return false
                },
                COMMAND_PRIORITY_LOW
            )
        )
    }, [editor, onClick, onDelete, onKeyDown, isSelected])

    const tooltip = node.templateInput.placeholder
    const text = node.templateInput.placeholder

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span ref={ref} className={composedClassNames}>
                    <span>{text}</span>
                </span>
            </TooltipTrigger>
            {tooltip && <TooltipContent>{tooltip}</TooltipContent>}
        </Tooltip>
    )
}
