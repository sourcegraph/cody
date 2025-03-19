@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class UIToolOutput(
  val type: TypeEnum, // Oneof: search-result, terminal-output, file-diff, file-view, status
  val status: UIToolStatus? = null, // Oneof: pending, done, error, canceled, idle, info
  val title: String? = null,
  val content: String? = null,
  val duration: Long? = null,
  val query: String? = null,
  val items: List<UISearchItem>,
  val output: List<UITerminalLine>,
  val total: UIChangeStats,
  val changes: List<UIDiffLine>,
  val uri: Uri,
  val file: UIFileBase,
) {

  enum class TypeEnum {
    @SerializedName("search-result") `Search-result`,
    @SerializedName("terminal-output") `Terminal-output`,
    @SerializedName("file-diff") `File-diff`,
    @SerializedName("file-view") `File-view`,
    @SerializedName("status") Status,
  }
}

