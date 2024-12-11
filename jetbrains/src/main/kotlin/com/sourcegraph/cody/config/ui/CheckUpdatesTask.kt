package com.sourcegraph.cody.config.ui

import com.intellij.ide.plugins.CustomPluginRepositoryService
import com.intellij.ide.plugins.PluginManagerConfigurable
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.updateSettings.impl.PluginDownloader
import com.intellij.openapi.updateSettings.impl.UpdateChecker
import com.intellij.openapi.util.BuildNumber
import com.sourcegraph.common.NotificationGroups
import java.lang.reflect.InvocationTargetException

class CheckUpdatesTask(project: Project) :
    Task.Backgroundable(project, "Checking for Sourcegraph Cody + Code Search update...", false) {

  override fun run(indicator: ProgressIndicator) {
    val availableUpdate = getAvailablePluginDownloaders(indicator).find { it.id == pluginId }
    if (availableUpdate != null) {
      CustomPluginRepositoryService.getInstance().clearCache()
      notifyAboutTheUpdate(project)
    }
  }

  companion object {
    private val logger = Logger.getInstance(CheckUpdatesTask::class.java)
    private val pluginId = PluginId.getId("com.sourcegraph.jetbrains")

    fun getAvailablePluginDownloaders(indicator: ProgressIndicator): Collection<PluginDownloader> {
      try {
        val getInternalPluginUpdatesMethod =
            UpdateChecker.javaClass.getMethod(
                "getInternalPluginUpdates", BuildNumber::class.java, ProgressIndicator::class.java)
        val internalPluginUpdates = getInternalPluginUpdatesMethod.invoke(null, null, indicator)
        val getPluginUpdatesMethod = internalPluginUpdates.javaClass.getMethod("getPluginUpdates")
        val pluginUpdates = getPluginUpdatesMethod.invoke(internalPluginUpdates)
        val getAllEnabledMethod = pluginUpdates.javaClass.getMethod("getAllEnabled")
        val allEnabled = getAllEnabledMethod.invoke(pluginUpdates)
        return allEnabled?.let { it as (Collection<PluginDownloader>) } ?: emptyList()
      } catch (e: Exception) {
        when (e) {
          is IllegalAccessException,
          is NoSuchMethodException,
          is InvocationTargetException,
          is ClassCastException -> {
            logger.warn(e)
          }
          else -> throw e
        }
      }
      return emptyList()
    }

    fun notifyAboutTheUpdate(project: Project) {
      val notification =
          FullContent(
              NotificationGroups.CODY_UPDATES,
              "Update Available",
              "A new version of Sourcegraph Cody + Code Search is available. Go to plugin settings to update.",
              NotificationType.IDE_UPDATE)
      notification.addAction(
          NotificationAction.createSimpleExpiring("Go to Plugins") {
            ShowSettingsUtil.getInstance()
                .showSettingsDialog(project, PluginManagerConfigurable::class.java)
          })
      notification.notify(project)
    }

    private class FullContent(
        groupId: String,
        notificationTitle: String,
        content: String,
        type: NotificationType
    ) : Notification(groupId, notificationTitle, content, type), NotificationFullContent
  }
}
