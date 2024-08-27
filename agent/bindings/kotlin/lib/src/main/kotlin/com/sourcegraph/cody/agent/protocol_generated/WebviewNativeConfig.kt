@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class WebviewNativeConfig(
  val view: ViewEnum, // Oneof: multiple, single
  val cspSource: String,
  val assetLoader: AssetLoaderEnum? = null, // Oneof: fs, webviewasset
  val webviewBundleServingPrefix: String,
  val rootDir: String? = null,
  val injectScript: String? = null,
  val injectStyle: String? = null,
) {

  enum class ViewEnum {
    @SerializedName("multiple") Multiple,
    @SerializedName("single") Single,
  }

  enum class AssetLoaderEnum {
    @SerializedName("fs") Fs,
    @SerializedName("webviewasset") Webviewasset,
  }
}

