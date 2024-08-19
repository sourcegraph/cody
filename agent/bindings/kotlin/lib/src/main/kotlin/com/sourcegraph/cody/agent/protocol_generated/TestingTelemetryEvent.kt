@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class TestingTelemetryEvent(
  val feature: String,
  val action: String,
  val source: SourceParams,
  val timestamp: String,
  val testOnlyAnonymousUserID: String,
)

