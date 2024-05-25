package com.sourcegraph.cody.agent.protocol

data class InlineEditParams(val instruction: String, val model: String, val mode: String)
