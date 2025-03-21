@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AutoeditRequestStateForAgentTesting(
  val phase: Phase? = null, // Oneof: started, contextLoaded, loaded, postProcessed, suggested, read, accepted, rejected, discarded
  val read: Boolean? = null,
)

