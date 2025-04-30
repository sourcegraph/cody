package com.sourcegraph.cody.config.ui.lang

import com.intellij.util.ui.PresentableEnum

enum class UpdateMode : PresentableEnum {
  Automatic,
  Ask,
  Never;

  override fun getPresentableText(): String {
    return when (this) {
      Automatic -> "Update automatically"
      Ask -> "Check for updates and ask me"
      Never -> "Don't check for updates"
    }
  }
}
