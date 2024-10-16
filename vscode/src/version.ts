import * as vscode from 'vscode'

import { setExtensionVersion } from '@sourcegraph/cody-shared'
import { version as packageVersion } from '../package.json'

// The runtime version (available from the host extension) will represent
// pre-release numbers properly, otherwise fall back to the stable/static one
// inlined at build time
export const version =
    (vscode.extensions.getExtension('sourcegraph.cody-ai')?.packageJSON as { version: string })
        ?.version ?? packageVersion

setExtensionVersion(version)
