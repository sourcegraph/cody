import * as vscode from 'vscode'

import packageJson from '../../../package.json'
import { version } from '../../version'

export function openCodyIssueReporter() {
    void vscode.commands.executeCommand('workbench.action.openIssueReporter', {
        extensionId: `${packageJson.publisher}.${packageJson.name}`,
        issueBody,
        issueTitle: '',
    })
}

const issueBody = `# Please complete the information below before submitting this form.

## Extension Information

##  Steps to Reproduce
<!-- A detailed description of the issue -->
1.
2.
3.

## Expected Behaviour
<!-- A detailed description of what you expected to happen -->

## Logs
<!-- Attach logs from the 'Cody Debug: Export Logs' command -->

<!-- Do not remove this section -->
- Cody Version: ${version}
- VS Code Version: ${vscode.version}
- Extension Host: ${vscode.env.appHost}
<!-- // -->
`
