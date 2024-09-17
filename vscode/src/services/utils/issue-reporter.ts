import * as vscode from 'vscode'

// import packageJson from '../../../package.json'
// import { version } from '../../version'

export function openCodyIssueReporter() {
    // void vscode.commands.executeCommand('workbench.action.openIssueReporter', {
    //     extensionId: `${packageJson.publisher}.${packageJson.name}`,
    const baseUrl = "https://help.sourcegraph.com/hc/en-us/requests/new";
    const subject = "Cody Feedback";
    const description = "I'd like to provide feedback about Cody";

    const params = new URLSearchParams({
        ticket_form_id: "7300762080909",
        tf_subject: encodeURIComponent(subject),
        tf_description: encodeURIComponent(description),
        tf_360041500552: "defect_report"
    });

    const url = `${baseUrl}?${params.toString()}`;
    vscode.env.openExternal(vscode.Uri.parse(url));
}

// const issueBody = `## Extension Information
// <!-- Do not remove the pre-filled information below -->
// - lfjsdkljsdflkjsdlfjsdfljsd
// `
