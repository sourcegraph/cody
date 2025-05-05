package com.sourcegraph.cody.config.ui

import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.updateSettings.impl.UpdateSettings
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.panel
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.SettingsModel
import com.sourcegraph.cody.config.ui.lang.UpdateMode
import com.sourcegraph.config.ConfigUtil

class SourcegraphConfigurable(val project: Project) :
    BoundConfigurable(ConfigUtil.SOURCEGRAPH_DISPLAY_NAME) {
  private lateinit var dialogPanel: DialogPanel
  private var channel: UpdateChannel = findConfiguredChannel()
  private val codyApplicationSettings = CodyApplicationSettings.instance
  private val settingsModel = SettingsModel(updateMode = codyApplicationSettings.updateMode)

  override fun createPanel(): DialogPanel {
    dialogPanel = panel {
      group("Plugin") {
        row {
          label("Update channel:")
          comboBox(
                  UpdateChannel.values().toList(),
                  SimpleListCellRenderer.create("") { it.presentableText })
              .bindItem({ channel }, { channel = it!! })
        }
        row {
          label("Update mode:")
          comboBox(
                  UpdateMode.values().toList(),
                  SimpleListCellRenderer.create("") { it.presentableText })
              .bindItem({ settingsModel.updateMode }, { settingsModel.updateMode = it!! })
        }
      }
    }
    return dialogPanel
  }

  override fun reset() {
    dialogPanel.reset()
    codyApplicationSettings.updateMode = settingsModel.updateMode
  }

  override fun apply() {
    super.apply()
    codyApplicationSettings.updateMode = settingsModel.updateMode
    if (codyApplicationSettings.updateMode != UpdateMode.Never) {
      CheckUpdatesTask(project).queue()
    }

    applyChannelConfiguration()
  }

  private fun applyChannelConfiguration() {
    val configuredChannel = findConfiguredChannel()
    val newChannel = channel

    if (!configuredChannel.equals(newChannel)) {
      if (!UpdateChannel.Stable.equals(configuredChannel)) {
        UpdateSettings.getInstance().storedPluginHosts.remove(configuredChannel.channelUrl)
      }

      if (!UpdateChannel.Stable.equals(newChannel)) {
        UpdateSettings.getInstance().storedPluginHosts.add(newChannel.channelUrl)
      }
    }
  }

  private fun findConfiguredChannel(): UpdateChannel {
    var currentChannel = UpdateChannel.Stable
    for (channel in UpdateChannel.values()) {
      val url = channel.channelUrl
      if (url != null && UpdateSettings.getInstance().storedPluginHosts.contains(url)) {
        currentChannel = channel
        break
      }
    }
    return currentChannel
  }
}
