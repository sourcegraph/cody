import type { Span } from '@opentelemetry/api'
import { type ContextItem, type ProcessingStep, logDebug } from '@sourcegraph/cody-shared'
import * as uuid from 'uuid'
import * as vscode from 'vscode'
import { getContextFromRelativePath } from '../../../commands/context/file-path'
import type { CodyTool } from '../CodyTool'
import { CodyToolProvider } from '../CodyToolProvider'
import type { PlanTracker } from './PlanTracker'

interface Step {
    name: 'edit_file' | 'create_file' | 'run_bash' | 'code_search' | 'next_step'
    edit_file?: EditStep
    create_file?: CreateStep
    run_bash?: ShellStep
    code_search?: SearchStep
    next_step?: NextStep
}

interface EditStep {
    file: string
    regex: string
    replacement: string
    replaceAll?: boolean
}

interface CreateStep {
    file: string
    content: string
}

interface ShellStep {
    command: string
    note?: 'danger'
}
interface SearchStep {
    query: string
}

type NextStepType = 'done' | 'next' | 'skip' | 'help' | 'stay'

interface NextStep {
    step: NextStepType
}

// TODO: Add feedback loop for each step before proceeding to the next step
export class PlanRunner {
    private tools: CodyTool[] = []
    private context: ContextItem[] = []
    constructor(
        private tracker: PlanTracker,
        private span: Span,
        private onConfirmationNeeded: (
            id: string,
            step: Omit<ProcessingStep, 'id' | 'type' | 'state'>
        ) => Promise<boolean>
    ) {
        this.tools = CodyToolProvider.getTools()
    }

    public async process(raw: string): Promise<ContextItem[] | undefined> {
        if (!raw || raw.includes('NO_STEP')) {
            return
        }

        // Remove surrounding backticks with json
        const steps = raw
            .replace(/^```json/gm, '')
            .replace(/```$/gm, '')
            .trim()
            .replace(/^\n*/, '')

        logDebug('PlanRunner', 'got steps', { verbose: steps })

        // Create a vscode temp file with the plan
        // const uri = vscode.Uri.parse('untitled:plan.json')
        // const document = await vscode.workspace.openTextDocument(uri)
        // const editor = await vscode.window.showTextDocument(document)
        // editor.edit(edit => {
        //     edit.insert(new vscode.Position(0, 0), steps)
        // })

        const parsedSteps = this.parseSteps(steps)
        if (!parsedSteps || parsedSteps.length === 0) {
            logDebug('PlanRunner', 'Failed to parse steps')
            vscode.window.showInformationMessage('No plan or steps detected')
            this.tracker.updateStepStatus('error', new Error('Failed to parse steps'))
            return
        }

        logDebug('PlanRunner', 'parsed steps', { verbose: parsedSteps })

        for (const step of parsedSteps) {
            if (step.next_step) {
                await this.processNextStep(step.next_step)
            } else if (step.edit_file) {
                await this.processEditStep(step.edit_file)
            } else if (step.create_file) {
                await this.processCreateStep(step.create_file)
            } else if (step.run_bash) {
                await this.processShellStep(step.run_bash)
            } else if (step.code_search) {
                await this.processSearchStep(step.code_search)
            }
        }

        return this.context
    }

    private parseSteps(steps: string): Step[] {
        try {
            return JSON.parse(steps)?.steps as Step[]
        } catch {
            return []
        }
    }

    private async processCreateStep(step: CreateStep): Promise<void> {
        logDebug('PlanRunner', 'processing file creation', { verbose: step })
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                logDebug('PlanRunner', 'no workspace')
                return
            }
            const uri = vscode.Uri.joinPath(workspaceFolder.uri, step.file)
            const workspaceEditor = new vscode.WorkspaceEdit()
            workspaceEditor.createFile(uri, {
                overwrite: true,
                ignoreIfExists: true,
            })
            workspaceEditor.insert(uri, new vscode.Position(0, 0), step.content)
            await vscode.workspace.applyEdit(workspaceEditor)
            const doc = await vscode.workspace.openTextDocument(uri)
            await doc.save() // Save the file
            this.tracker.updateStepStatus('success')
            const newFile = await getContextFromRelativePath(step.file)
            if (newFile) {
                this.context.push(newFile)
            }
        } catch (error) {
            this.tracker.updateStepStatus('error')
            throw new Error(`Failed to save your Custom Commands to a JSON file: ${error}`)
        }
    }

    private async processEditStep(edit: EditStep): Promise<void> {
        vscode.window.showInformationMessage('Edit steps detected. Applying changes...')
        const { file, regex, replacement, replaceAll } = edit
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (!workspaceFolder) {
            logDebug('PlanRunner', 'no workspace')
            return
        }
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, file)
        const document = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(document)
        const text = editor.document.getText()

        const newText = replaceAll
            ? text.replaceAll(regex, replacement)
            : this.replaceText(text, regex, replacement)
        if (text && newText && text !== newText) {
            editor
                .edit(edit => {
                    const lastLine = document.lineAt(document.lineCount - 1)
                    const fullRange = new vscode.Range(
                        0,
                        0,
                        document.lineCount - 1,
                        lastLine.text.length
                    )
                    edit.replace(fullRange, newText)
                })
                .then(success => {
                    if (success) {
                        document.save()
                    } else {
                        logDebug('PlanRunner', 'Edit failed', { verbose: edit })
                    }
                })
        }

        const newFile = await getContextFromRelativePath(file)
        if (newFile) {
            this.context.push(newFile)
        }

        vscode.window.showInformationMessage('Edit completed...')
        this.tracker.updateStepStatus('success')
    }

    public replaceText(text: string, pattern: string, replacement: string): string | undefined {
        // Early return for invalid inputs
        if (!text || !pattern || !replacement) {
            return undefined
        }

        try {
            // Prioritize direct string replacement first
            if (text.includes(pattern)) {
                return text.replace(pattern, replacement)
            }

            const regex = new RegExp(pattern, 'g')
            const result = text.replace(regex, replacement)

            return result !== text ? result : undefined
        } catch (error) {
            logDebug('PlanRunner', 'Failed to process pattern or replacement', { verbose: error })
            return undefined
        }
    }

    private async processShellStep(shell: ShellStep): Promise<void> {
        const currentTask = this.tracker.getCurrentStep()
        if (currentTask) {
            const stepId = `planner-shell-${uuid.v4()}`
            const confirmed = await this.onConfirmationNeeded(stepId, {
                title: 'Terminal command',
                content: shell.command,
            })
            if (!confirmed) {
                return
            }
        }

        logDebug('PlanRunner', 'processing shell', { verbose: shell })
        const terminal = vscode.window.createTerminal()
        terminal.show()
        if (shell.command && shell.note !== 'danger') {
            terminal.sendText(shell.command)
            logDebug('PlanRunner', 'shell command', { verbose: { command: shell.command } })
            terminal.show()
            this.tracker.updateStepStatus('success')
        }
    }

    private async processSearchStep(search: SearchStep): Promise<void> {
        try {
            logDebug('PlanRunner', 'processing code search', { verbose: search })
            const query = search.query
            logDebug('PlanRunner', 'processSearchStep', { verbose: query })
            const searchTool = this.tools.find(t => t.config.tags.tag.toString() === 'TOOLSEARCH')
            if (searchTool) {
                const results = await searchTool.execute(this.span, [query])
                // logDebug('PlanRunner', 'search results', { verbose: results })
                this.context.push(...results.slice(0, 5))
                vscode.window.showInformationMessage('Searching: ' + query)
                this.tracker.updateStepStatus('success')
            }
        } catch (error) {
            logDebug('PlanRunner', 'Failed to process code search', { verbose: error })
            if (error instanceof Error) {
                this.tracker.updateStepStatus('error', error)
            }
        }
    }

    private async processNextStep(next: NextStep): Promise<void> {
        switch (next.step) {
            case 'skip':
                vscode.window.showInformationMessage('Skipping task.')
                this.tracker.updateStepStatus('error')
                break
            case 'help':
                vscode.window.showInformationMessage('Stopping task for user clarification.')
                this.tracker.updateStepStatus('error')
                break
            case 'done':
                vscode.window.showInformationMessage('Task completed successfully.')
                this.tracker.updateStepStatus('success')
                break
            // case 'next': // Default to next step
            default:
                vscode.window.showInformationMessage('Moving to next step.')
                this.tracker.updateStepStatus('success')
                break
        }
    }
}
