import * as vscode from 'vscode'
import { version } from '../../version'
import { isdo } from '@sourcegraph/cody-shared'

function getOSName(): string {
    if (process.platform === 'win32') {
        return 'Windows'
    }
    if (process.platform === 'darwin') {
        return 'macOS'
    }
    return 'Linux'
}

export function openCodyIssueReporter() {
    const baseUrl = "https://help.sourcegraph.com/hc/en-us/requests/new";
    const subject = "Cody Issue Report";

    const params = new URLSearchParams({
        ticket_form_id: "7300762080909",
        tf_subject: encodeURIComponent(subject),
        tf_description: encodeURIComponent(issueBody),
        tf_360041500552: "defect_report"
    });

    const url = `${baseUrl}?${params.toString()}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
}

const issueBody = `
- Cody Version: ${version}
- VS Code Version: ${vscode.version}
- Extension Host: ${vscode.env.appHost}
- Operating System: ${getOSName()}

Steps to Reproduce
1.
2.
3.

## Expected Behaviour

## Logs
`