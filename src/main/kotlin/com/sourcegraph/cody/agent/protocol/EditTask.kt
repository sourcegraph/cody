package com.sourcegraph.cody.agent.protocol

data class EditTask(val id: String, val state: CodyTaskState, val selectionRange: Range)
