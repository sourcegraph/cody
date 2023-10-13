package com.sourcegraph.cody.config.ui

import com.intellij.util.ui.PresentableEnum

enum class UpdateChannel(val channelUrl: String?) : PresentableEnum {
  Stable(null as String?),
  Nightly("https://plugins.jetbrains.com/plugins/nightly/9682");

  override fun getPresentableText(): String {
    return when (this) {
      Stable -> "Stable"
      Nightly -> "Nightly"
    }
  }
}
