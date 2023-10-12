package com.sourcegraph.cody.config.ui

import com.intellij.util.ui.PresentableEnum

enum class UpdateChannel(val channelUrl: String?) : PresentableEnum {
  Stable(null as String?),
  Alpha("https://plugins.jetbrains.com/plugins/alpha/9682");

  override fun getPresentableText(): String {
    return when (this) {
      Stable -> "Stable"
      Alpha -> "Nightly"
    }
  }
}
