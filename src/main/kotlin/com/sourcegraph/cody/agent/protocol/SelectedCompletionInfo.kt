package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.vscode.Range

data class SelectedCompletionInfo(val text: String, val range: Range)
