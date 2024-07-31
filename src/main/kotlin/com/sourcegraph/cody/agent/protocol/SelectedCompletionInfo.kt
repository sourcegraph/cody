package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.protocol_generated.Range

data class SelectedCompletionInfo(val text: String, val range: Range)
