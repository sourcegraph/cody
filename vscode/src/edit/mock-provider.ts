import type { EditProviderOptions } from './provider'
import { EditProvider } from './provider'

export class MockEditProvider extends EditProvider {
    // TODO: Where do find the script file to use, or define the scripts?
    constructor(public config: EditProviderOptions) {
        super(config)
    }

    public async startEdit(): Promise<void> {
        this.config.controller.startTask(this.config.task)
        // Here we elided all the machinery around talking to a real LLM.

        // Stuff to handle:
        // - file creation
        // - insert
        // - edit
    }

    protected handleError(error: Error): void {
        this.config.controller.error(this.config.task.id, error)
    }
}
