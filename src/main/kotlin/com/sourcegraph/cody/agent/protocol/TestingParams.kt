package com.sourcegraph.cody.agent.protocol

data class TestingParams(
    val selectedText: String? = null,
    val sourceOfTruthDocument: ProtocolTextDocument? = null,
) {
  companion object {
    val doIncludeTestingParam =
        "true".equals(System.getProperty("cody-agent.panic-when-out-of-sync", "false"))
  }
}
