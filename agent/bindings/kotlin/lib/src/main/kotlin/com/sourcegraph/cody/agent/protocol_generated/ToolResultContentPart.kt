@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class ToolResultContentPart(
  val type: TypeEnum, // Oneof: tool_result
  val tool_result: Tool_resultParams,
  val output: UIToolOutput? = null,
) {

  enum class TypeEnum {
    @SerializedName("tool_result") ToolResult,
  }
}

