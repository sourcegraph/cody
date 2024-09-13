@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class WebviewNativeConfig(
  val view: ViewEnum, // Oneof: multiple, single
  val cspSource: String,
  val webviewBundleServingPrefix: String? = null,
  val skipResourceRelativization: Boolean? = null,
  val injectScript: String? = null,
  val injectStyle: String? = null,
) {

  enum class ViewEnum {
    @SerializedName("multiple") Multiple,
    @SerializedName("single") Single,
  }
}

