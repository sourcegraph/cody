package com.sourcegraph.utils

import com.intellij.codeWithMe.ClientId
import com.intellij.openapi.client.ClientSessionsManager

object CodyIdeUtil {
  fun isRD() = ClientSessionsManager.getAppSession(ClientId.current)?.isRemote ?: false
}
