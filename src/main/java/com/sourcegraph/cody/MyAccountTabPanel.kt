package com.sourcegraph.cody

import com.intellij.ide.BrowserUtil
import com.intellij.ide.ui.LafManagerListener
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.config.AccountTier
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.UpgradeToCodyProNotification
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.config.ThemeUtil
import java.awt.BorderLayout
import java.net.URLEncoder
import javax.swing.JPanel
import javax.swing.border.EmptyBorder

class MyAccountTabPanel(val project: Project) : JPanel() {

  private var chatLimitError = UpgradeToCodyProNotification.chatRateLimitError.get()
  private var autocompleteLimitError = UpgradeToCodyProNotification.autocompleteRateLimitError.get()

  init {
    layout = BorderLayout()
    border = EmptyBorder(JBUI.insets(4))
    if (chatLimitError != null || autocompleteLimitError != null) {
      add(createRateLimitPanel(), BorderLayout.PAGE_START)
    }
    ApplicationManager.getApplication()
        .messageBus
        .connect()
        .subscribe(LafManagerListener.TOPIC, LafManagerListener { update() })
  }

  private fun createRateLimitPanel() = panel {
    row {
      text(
          "<table width=\"100%\">" +
              "<tr>" +
              "<td width=\"10%\"><span style=\"font-size:20px;\">⚡</span></td>" +
              "<td width=\"90%\"><p>${
                  if (autocompleteLimitError != null && chatLimitError != null) {
                    CodyBundle.getString("my-account-tab.chat-and-autocomplete-rate-limit-error")
                  } else {
                    if (chatLimitError != null) {
                      CodyBundle.getString("my-account-tab.chat-rate-limit-error")
                    } else {
                      CodyBundle.getString("my-account-tab.autocomplete-rate-limit-error")
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

  private fun createCenterPanel(accountTier: AccountTier?) = panel {
    val tier =
        when (accountTier) {
          null -> CodyBundle.getString("my-account-tab.loading-label")
          AccountTier.DOTCOM_PRO -> CodyBundle.getString("my-account-tab.cody-pro-label")
          else -> CodyBundle.getString("my-account-tab.cody-free-label")
        }
    row { label("<html>Current tier: <b>$tier</b><html/>") }
    row {
      if (accountTier == AccountTier.DOTCOM_FREE) {
        val upgradeButton =
            button("Upgrade") { BrowserUtil.browse(ConfigUtil.DOTCOM_URL + "cody/subscription") }
        upgradeButton.component.putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
      }
      button("Manage Account") {
        val manageUrl = "${ConfigUtil.DOTCOM_URL}" + "cody/manage"
        val account = CodyAuthenticationManager.getInstance(project).getActiveAccount()
        if (account != null) {
          BrowserUtil.browse(
              manageUrl + "?cody_client_user=" + URLEncoder.encode(account.name, "UTF-8"))
        } else {
          BrowserUtil.browse(manageUrl)
        }
      }
    }
    if (accountTier == AccountTier.DOTCOM_FREE) {
      row { text(CodyBundle.getString("my-account-tab.already-pro")) }
    }
  }

  @RequiresEdt
  fun update() {
    this.removeAll()
    chatLimitError = UpgradeToCodyProNotification.chatRateLimitError.get()
    autocompleteLimitError = UpgradeToCodyProNotification.autocompleteRateLimitError.get()
    if (chatLimitError != null || autocompleteLimitError != null) {
      this.add(createRateLimitPanel(), BorderLayout.PAGE_START)
    }
    var accountTier =
        CodyAuthenticationManager.getInstance(project).getActiveAccountTier().getNow(null)
    this.add(createCenterPanel(accountTier))

    revalidate()
    repaint()
  }
}
