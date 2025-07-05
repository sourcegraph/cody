package com.sourcegraph.utils

import com.intellij.idea.AppMode

object CodyIdeUtil {
  fun isRD() = AppMode.isRemoteDevHost()
}
