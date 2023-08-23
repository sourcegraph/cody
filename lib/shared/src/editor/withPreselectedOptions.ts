import { Editor } from '.'

export type PrefilledOptions = [string[], string][]

export function withPreselectedOptions(editor: Editor, preselectedOptions: PrefilledOptions): Editor {
    const proxy = new Proxy<Editor>(editor, {
        get(target: Editor, property: string, receiver: unknown) {
            if (property === 'quickPick') {
                return async function quickPick(options: string[]): Promise<string | null> {
                    for (const [preselectedOption, selectedOption] of preselectedOptions) {
                        if (preselectedOption === options) {
                            return Promise.resolve(selectedOption)
                        }
                    }
                    return target.quickPick(options)
                }
            }
            return Reflect.get(target, property, receiver)
        },
    })

    return proxy
}
