import fs from 'node:fs'
import * as JSON5 from 'json5'
import * as vscode from 'vscode'

interface KeyBindingData {
    key: string
    command: string
    // Allow additional fields but we don't use them
    [key: string]: unknown
}

const VIM_EXTENSION_ID = 'vscodevim.vim'
// https://github.com/VSCodeVim/Vim/blob/master/package.json#L113
const VIM_TAB_COMMAND = 'extension.vim_tab'

enum OperatingSystem {
    windows = 'windows',
    macos = 'macos',
    linux = 'linux',
}

export class VimTabKeyBindingConflictChecker {
    private readonly PLATFORM_TO_OS_MAPPING = {
        netbsd: OperatingSystem.linux,
        openbsd: OperatingSystem.linux,
        freebsd: OperatingSystem.linux,
        sunos: OperatingSystem.linux,
        aix: OperatingSystem.linux,
        android: OperatingSystem.linux,
        haiku: OperatingSystem.linux,
        linux: OperatingSystem.linux,
        darwin: OperatingSystem.macos,
        cygwin: OperatingSystem.windows,
        win32: OperatingSystem.windows,
    }
    private isTabKeyConflictingWithVim: boolean

    constructor() {
        this.isTabKeyConflictingWithVim = this.doesVimTabConflictWithAutoedits()
    }

    public doesVimTabConflictWithAutoeditsInNormalMode(): boolean {
        const vimExtension = this.getVimExtensionIfActive()
        if (vimExtension) {
            const vimApi = vimExtension.exports
            return vimApi.status.getState().mode === 'NORMAL' && this.isTabKeyConflictingWithVim
        }
        return (
            vimExtension !== undefined &&
            vscode.workspace.getConfiguration().get<string>('vim.mode') === 'Normal' &&
            this.isTabKeyConflictingWithVim
        )
    }

    private doesVimTabConflictWithAutoedits(): boolean {
        const tabConflictDefaultValue = this.doesVimTabBindingExist()

        // Read VSCode keybindings.json to check if user has overrided the tab keybinding
        const keyBindingsPath = this.getUserDefinedKeyBindingsPath()
        if (!keyBindingsPath) {
            return tabConflictDefaultValue
        }

        try {
            const fileContent = fs.readFileSync(keyBindingsPath, 'utf8')
            //we can't use JSON.parse() because file may contain comments
            const keybindings = JSON5.parse(fileContent)
            const keybindingsData = this.getKeyBindingsMapping(keybindings as KeyBindingData[])

            // If user has overrided the vim tab binding to some other key, we don't have conflict anymore
            return VIM_TAB_COMMAND in keybindingsData
                ? keybindingsData[VIM_TAB_COMMAND].toLowerCase() === 'tab'
                : tabConflictDefaultValue
        } catch (error) {
            return tabConflictDefaultValue
        }
    }

    private doesVimTabBindingExist(): boolean {
        // The "vim" extension is not active if undefined, so not conflict
        const vimExtension = this.getVimExtensionIfActive()
        if (vimExtension === undefined) {
            return false
        }
        try {
            const vimKeyBindings = this.getKeyBindingsMapping(
                vimExtension.packageJSON.contributes.keybindings as KeyBindingData[]
            )
            // Verify the conflicting key binding exists
            return (
                VIM_TAB_COMMAND in vimKeyBindings &&
                vimKeyBindings[VIM_TAB_COMMAND].toLowerCase() === 'tab'
            )
        } catch (error) {
            return false
        }
    }

    private getVimExtensionIfActive(): vscode.Extension<any> | undefined {
        // Returns undefined if extension is not installed or is installed but disabled
        return vscode.extensions.getExtension(VIM_EXTENSION_ID)
    }

    private getUserDefinedKeyBindingsPath(): string | undefined {
        // Reference: https://stackoverflow.com/questions/40682100/vs-code-extension-programmatically-find-keybindings

        // Handle portable mode vs regular installation
        const userDataPath = process.env.VSCODE_PORTABLE
            ? vscode.Uri.file(`${process.env.VSCODE_PORTABLE}/user-data/User`)
            : this.getVSCPath()

        if (!userDataPath) {
            return undefined
        }
        return `${userDataPath}/User/keybindings.json`.replace(
            /\//g,
            process.platform === 'win32' ? '\\' : '/'
        )
    }

    private getVSCPath(): string | undefined {
        const vscPath = {
            windows: `${process.env.APPDATA}/Code`,
            macos: `${process.env.HOME}/Library/Application Support/Code`,
            linux: `${process.env.HOME}/config/Code`,
        }
        const path = vscPath[this.PLATFORM_TO_OS_MAPPING[process.platform]]
        return path
    }

    /**
     * Converts an array of key binding data into a mapping of commands to their key bindings.
     * @param bindingsData Array of key binding data objects containing command and key information
     * @returns Record mapping command strings to their corresponding key binding strings
     */
    private getKeyBindingsMapping(bindingsData: KeyBindingData[]): Record<string, string> {
        return bindingsData.reduce((acc: Record<string, string>, binding) => {
            acc[binding.command] = binding.key
            return acc
        }, {})
    }
}
