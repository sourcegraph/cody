@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class CodyError(
  val message: String,
  val cause: CodyError? = null,
  val stack: String? = null,
)

