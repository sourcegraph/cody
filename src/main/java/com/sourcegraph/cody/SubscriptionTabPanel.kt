package com.sourcegraph.cody

import com.intellij.ide.BrowserUtil
import com.intellij.ide.ui.LafManagerListener
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.application.ApplicationManager
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.ui.JBUI
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.config.ThemeUtil
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.border.EmptyBorder

class SubscriptionTabPanel : JPanel() {

  private var isCurrentUserPro: Boolean? = null
  private var chatLimitError = UpgradeToCodyProNotification.chatRateLimitError.get()
  private var autocompleteLimitError = UpgradeToCodyProNotification.autocompleteRateLimitError.get()

  init {
    layout = BorderLayout()
    border = EmptyBorder(JBUI.insets(4))
    if (chatLimitError != null || autocompleteLimitError != null) {
      add(createRateLimitPanel(), BorderLayout.PAGE_START)
    }
    add(createCenterPanel())
    ApplicationManager.getApplication()
        .messageBus
        .connect()
        .subscribe(LafManagerListener.TOPIC, LafManagerListener { update(isCurrentUserPro) })
  }

  private fun createRateLimitPanel() = panel {
    row {
      text(
          "<table width=\"100%\">" +
              "<tr>" +
              "<td width=\"10%\"><span style=\"font-size:20px;\">⚡</span></td>" +
              "<td width=\"90%\"><p>${
                  if (autocompleteLimitError != null && chatLimitError != null) {
                    CodyBundle.getString("subscription-tab.chat-and-autocomplete-rate-limit-error")
                  } else {
                    if (chatLimitError != null) {
                      CodyBundle.getString("subscription-tab.chat-rate-limit-error")
                    } else {
                      CodyBundle.getString("subscription-tab.autocomplete-rate-limit-error")
                    }
                  }
                }</p></td>" +
              "</tr>" +
              "</table>")
    }

    row {
      if (ThemeUtil.isDarkTheme()) {
        text("<div style=\"height: 1px; background-color: #404245;\"></div>")
      } else {
        text("<div style=\"height: 1px; background-color: #ECEDF1;\"></div>")
      }
    }
  }

  private fun createCenterPanel() = panel {
    val getIsCurrentUserPro = isCurrentUserPro
    val tier =
        if (getIsCurrentUserPro == null) CodyBundle.getString("subscription-tab.loading-label")
        else if (getIsCurrentUserPro) CodyBundle.getString("subscription-tab.cody-pro-label")
        else CodyBundle.getString("subscription-tab.cody-free-label")
    row { label("<html>Current tier: <b>$tier</b><html/>") }
    row {
      if (getIsCurrentUserPro != null && !getIsCurrentUserPro) {
        val upgradeButton =
            button("Upgrade") { BrowserUtil.browse(ConfigUtil.DOTCOM_URL + "cody/subscription") }
        upgradeButton.component.putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
      }
      button("Check Usage") { BrowserUtil.browse(ConfigUtil.DOTCOM_URL + "cody/manage") }
    }
    if (getIsCurrentUserPro != null && !getIsCurrentUserPro) {
      row { text(CodyBundle.getString("tab.subscription.already-pro")) }
    }
  }

  fun update(isCurrentUserPro: Boolean?) {
    this.isCurrentUserPro = isCurrentUserPro
    this.removeAll()
    chatLimitError = UpgradeToCodyProNotification.chatRateLimitError.get()
    autocompleteLimitError = UpgradeToCodyProNotification.autocompleteRateLimitError.get()
    if (chatLimitError != null || autocompleteLimitError != null) {
      this.add(createRateLimitPanel(), BorderLayout.PAGE_START)
    }
    this.add(createCenterPanel())
    revalidate()
    repaint()
  }
}
