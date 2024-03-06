import { FixupCodeLenses } from './non-stop/codelenses/provider'
import type { FixupActor, FixupFileCollection } from './non-stop/roles'
import type { FixupControlApplicator } from './non-stop/strategies'

// Lets the extension delegate to the client (VSCode, Agent, etc.) to control
// which components are used depending on the client's capabilities.
export interface ExtensionClient {
    // Create the component which decorates FixupTasks with controls.
    createFixupControlApplicator(files: FixupActor & FixupFileCollection): FixupControlApplicator
}

export function defaultVSCodeExtensionClient(): ExtensionClient {
    return {
        createFixupControlApplicator: files => new FixupCodeLenses(files),
    }
}
