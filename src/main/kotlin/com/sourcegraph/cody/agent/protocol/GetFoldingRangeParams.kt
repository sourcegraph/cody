package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.protocol_generated.Range

data class GetFoldingRangeParams(val uri: String, val range: Range)
