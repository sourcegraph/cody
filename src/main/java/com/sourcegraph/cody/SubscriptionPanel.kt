package com.sourcegraph.cody

import com.intellij.ide.BrowserUtil
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.ui.dsl.builder.panel
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.config.ConfigUtil

fun createSubscriptionTab(isCurrentUserPro: Boolean) = panel {
  val tier = if (isCurrentUserPro) "Cody Pro" else "Cody Free"
  row { label("<html>Current tier: <b>$tier</b><html/>") }
  row {
    if (!isCurrentUserPro) {
      val upgradeButton =
          button("Upgrade") { BrowserUtil.browse(ConfigUtil.DOTCOM_URL + "cody/subscription") }
      upgradeButton.component.putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
    }
    button("Check Usage") { BrowserUtil.browse(ConfigUtil.DOTCOM_URL + "cody/manage") }
  }
  if (!isCurrentUserPro) {
    row { text(CodyBundle.getString("tab.subscription.already-pro")) }
  }
}
