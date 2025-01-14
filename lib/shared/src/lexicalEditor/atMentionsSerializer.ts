import {type SerializedPromptEditorValue} from "./editorState";

export function serialize(m: SerializedPromptEditorValue): string {
    return `cody://serialized?data=${btoa(JSON.stringify(m, undefined, 0))}`;
}

export function deserialize(s: string): SerializedPromptEditorValue | undefined {
    if (!s.startsWith('cody://serialized?data=')) {
        console.warn('deserialize only accepts cody://serialized?data=... strings')
        return undefined
    }

    return JSON.parse(atob(s.slice('cody://serialized?data='.length))) as SerializedPromptEditorValue;
}
