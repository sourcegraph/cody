import {
    type SerializedTemplateInput,
    type SerializedTemplateInputNode,
    TEMPLATE_INPUT_NODE_TYPE,
} from '@sourcegraph/cody-shared'
import {
    $applyNodeReplacement,
    DecoratorNode,
    type EditorConfig,
    type LexicalEditor,
    type NodeKey,
} from 'lexical'
import { TemplateInputComponent } from './TemplateInputComponent'
import styles from './TemplateInputNode.module.css'

export class TemplateInputNode extends DecoratorNode<JSX.Element> {
    static getType(): typeof TEMPLATE_INPUT_NODE_TYPE {
        return TEMPLATE_INPUT_NODE_TYPE
    }

    static clone(node: TemplateInputNode): TemplateInputNode {
        return new TemplateInputNode(node.templateInput, node.key)
    }

    constructor(
        public templateInput: SerializedTemplateInput,
        private key?: NodeKey
    ) {
        super(key)
        this.templateInput = templateInput
    }

    createDOM(): HTMLElement {
        return document.createElement('span')
    }

    updateDOM(): boolean {
        return false
    }

    getTextContent(): string {
        return this.templateInput.placeholder
    }

    decorate(editor: LexicalEditor, _config: EditorConfig): JSX.Element {
        return (
            <TemplateInputComponent
                editor={editor}
                nodeKey={this.getKey()}
                node={this}
                className={`${styles.templateInputNode}`}
                focusedClassName={`${styles.templateInputNodeFocused}`}
            />
        )
    }

    static importJSON(serializedNode: SerializedTemplateInputNode): TemplateInputNode {
        return $createTemplateInputNode(serializedNode.templateInput)
    }

    exportJSON(): SerializedTemplateInputNode {
        return {
            type: TemplateInputNode.getType(),
            templateInput: this.templateInput,
            version: 1,
        }
    }
}

export function $createTemplateInputNode(templateInput: SerializedTemplateInput): TemplateInputNode {
    return $applyNodeReplacement(new TemplateInputNode(templateInput))
}

export function $isTemplateInputNode(node: unknown): node is TemplateInputNode {
    return node instanceof TemplateInputNode
}
