package com.sourcegraph.cody.config.ui

import com.intellij.ide.plugins.CustomPluginRepositoryService
import com.intellij.ide.plugins.PluginManagerMain
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.updateSettings.impl.PluginDownloader
import com.intellij.openapi.updateSettings.impl.UpdateChecker
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.config.ui.lang.UpdateMode
import com.sourcegraph.common.NotificationGroups

class CheckUpdatesTask(project: Project) :
    Task.Backgroundable(
        project,
        "Checking for Sourcegraph Cody + Code Search update...",
        /* canBeCancelled = */ true) {

  override fun run(indicator: ProgressIndicator) {
    val settings = CodyApplicationSettings.instance
    if (project.isDisposed ||
        indicator.isCanceled ||
        !settings.isCodyEnabled ||
        settings.updateMode == UpdateMode.Never) {
      return
    }

    val allUpdates =
        UpdateChecker.getInternalPluginUpdates(null, indicator).pluginUpdates.allEnabled
    val pluginUpdateDownloader = allUpdates.find { it.id == pluginId }
    if (pluginUpdateDownloader != null) {
      CustomPluginRepositoryService.getInstance().clearCache()

      if (settings.updateMode == UpdateMode.Ask) {
        notifyAboutTheUpdateAvailable(project, pluginUpdateDownloader, indicator)
      } else {
        update(project, pluginUpdateDownloader, indicator)
      }
    }
  }

  companion object {
    private val logger = Logger.getInstance(CheckUpdatesTask::class.java)
    private val pluginId = PluginId.getId("com.sourcegraph.jetbrains")

    fun update(
        project: Project,
        pluginUpdateDownloader: PluginDownloader,
        indicator: ProgressIndicator
    ) {
      if (project.isDisposed || indicator.isCanceled) return

      ApplicationManager.getApplication().executeOnPooledThread {
        try {
          if (pluginUpdateDownloader.prepareToInstall(indicator)) {
            pluginUpdateDownloader.install()
            PluginManagerMain.notifyPluginsUpdated(project)
          }
        } catch (e: Exception) {
          logger.warn("Error updating Cody plugin", e)
        }
      }
    }

    fun notifyAboutTheUpdateAvailable(
        project: Project,
        pluginDownloader: PluginDownloader,
        indicator: ProgressIndicator
    ) {
      val notification =
          FullContent(
              NotificationGroups.CODY_UPDATES,
              "Update Available",
              "A new version of Sourcegraph Cody + Code Search is available.",
              NotificationType.IDE_UPDATE)
      notification.addAction(
          NotificationAction.createSimpleExpiring("Update") {
            update(project, pluginDownloader, indicator)
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
