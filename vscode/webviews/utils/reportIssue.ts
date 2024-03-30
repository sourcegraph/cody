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
- Host: ${vscode.env.appHost}

##  Steps to Reproduce
<!-- A detailed description of the issue -->
1.
2.
3.

## Logs
<!-- Attach logs from the 'Cody Debug: Export Logs' command -->
`
