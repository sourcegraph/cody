import * as vscode from 'vscode'

import packageJson from '../../package.json'

export function openCodyIssueReporter() {
    void vscode.commands.executeCommand('workbench.action.openIssueReporter', {
        extensionId: `${packageJson.publisher}.${packageJson.name}`,
        issueBody,
        issueTitle: 'bug: ',
        uri: packageJson.bugs,
    })
}

const issueBody = `## Extension Information
<!-- Do not remove the pre-filled information below -->
- Cody Version: ${packageJson.version}
- VS Code Version: ${vscode.version}
- Extension Host: ${vscode.env.appHost}

##  Steps to Reproduce
<!-- A detailed description of the issue -->
1.
2.
3.

## Expected Behaviour
<!-- A detailed description of what you expected to happen -->

## Logs
<!-- Attach logs from the 'Cody Debug: Export Logs' command -->
`
