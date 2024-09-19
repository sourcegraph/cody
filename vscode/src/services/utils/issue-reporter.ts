import * as vscode from 'vscode'
import { version } from '../../version'
import { getConfiguration } from '../../configuration'
import { isDotComAuthed } from '@sourcegraph/cody-shared'

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
    const config = getConfiguration()
    const baseUrl = "https://help.sourcegraph.com/hc/en-us/requests/new";
    const subject = "Cody Issue Report";

    const params = new URLSearchParams({
        ticket_form_id: "7300762080909",
        tf_subject: encodeURIComponent(subject),
        tf_description: encodeURIComponent(generateIssueBody(config)),
        tf_360041500552: "defect_report"
    });

    const url = `${baseUrl}?${params.toString()}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
}

function generateIssueBody(config: ReturnType<typeof getConfiguration>): string {
    return `- Cody Version: ${version}
- VS Code Version: ${vscode.version}
- Extension Host: ${vscode.env.appHost}
- Operating System: ${getOSName()}
- Cody Free/Pro: ${isDotComAuthed()}

## Cody Configuration
- Server Endpoint: ${config.serverEndpoint}
- Use Context: ${config.useContext}
- Autocomplete Enabled: ${config.autocomplete}
- Code Actions Enabled: ${config.codeActions}
- Command Hints Enabled: ${config.commandHints}
- Debug Verbose: ${config.debugVerbose}
- Telemetry Level: ${config.telemetryLevel}

Steps to Reproduce
1.
2.
3.

Expected Behaviour

`
}