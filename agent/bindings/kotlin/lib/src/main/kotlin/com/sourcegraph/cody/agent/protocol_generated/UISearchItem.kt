@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class UISearchItem(
  val fileName: String,
  val uri: Uri,
  val content: String? = null,
  val lineNumber: String? = null,
  val preview: String? = null,
  val type: TypeEnum, // Oneof: file, folder, code
) {

  enum class TypeEnum {
    @SerializedName("file") File,
    @SerializedName("folder") Folder,
    @SerializedName("code") Code,
  }
}

