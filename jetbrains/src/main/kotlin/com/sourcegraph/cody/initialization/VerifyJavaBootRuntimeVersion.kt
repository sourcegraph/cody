package com.sourcegraph.cody.initialization

import com.intellij.lang.LangBundle
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.impl.jdkDownloader.*
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.util.registry.Registry
import com.intellij.util.asSafely
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

class VerifyJavaBootRuntimeVersion : Activity {

  override fun runActivity(project: Project) {
    if (isCurrentRuntimeMissingJcef()) {
      JcefRuntimeNotification().notify(project)
    }
  }

  companion object {
    private val logger = thisLogger()

    fun isCurrentRuntimeMissingJcef(): Boolean {
      val model = RuntimeChooserCurrentItem.currentRuntime()
      val doesNameContainJcefSuffix = model.version?.endsWith("-jcef") ?: true

      return true
      return !doesNameContainJcefSuffix
    }

    fun chooseJcefRuntimeAutomatically() {
      object :
              Task.Backgroundable(
                  null,
                  LangBundle.message(
                      "progress.title.choose.ide.runtime.downloading.jetbrains.runtime.list")) {
            override fun run(indicator: ProgressIndicator) {

              val builds =
                  service<RuntimeChooserJbrListDownloader>()
                      .downloadForUI(indicator)
                      .filter { RuntimeChooserJreValidator.isSupportedSdkItem(it) }
                      .filter { it.isDefaultItem }
                      // JCEF runtimes can be identified by "jcef" in the suggestedSdkName
                      // or "JCEF" in the product flavour description
                      // Example: suggestedSdkName = "jbr_jcef-17.0.12-osx-aarch64-b1000.54"
                      // Example: product.flavour = "JBR with JCEF (bundled by default)"
                      .filter {
                        it.suggestedSdkName.contains("jcef", ignoreCase = true) ||
                            it.product.flavour?.contains("JCEF", ignoreCase = true) == true
                      }
                      .map { RuntimeChooserDownloadableItem(it) }

              if (builds.isEmpty()) {
                logger.warn("No JCEF-supporting runtimes found. Showing manual runtime chooser.")
                RuntimeChooserUtil.showRuntimeChooserPopup()
                return
              }

              // The list of builds is sorted by default, get the latest one
              val first = builds.first()
              val item = first.asSafely<RuntimeChooserDownloadableItem>()?.item ?: return

              logger.info("Installing JCEF-supporting runtime: ${item.fullPresentationText}")
              val pathText = getDefaultInstallPathFor(item)
              val path = getInstallPathFromText(item, pathText)
              service<RuntimeChooserPaths>().installCustomJdk(item.fullPresentationText) { indicator
                ->
                service<RuntimeChooserDownloader>().downloadAndUse(indicator, item, path)
              }
            }
          }
          .queue()
    }

    private fun getDefaultInstallPathFor(item: JdkItem): String {
      val path = getInstallPathFromText(item, null)
      return FileUtil.getLocationRelativeToUserHome(path.toAbsolutePath().toString(), false)
    }

    private fun getInstallPathFromText(item: JdkItem, text: String?): Path {
      val path = text?.trim()?.takeIf { it.isNotBlank() }?.let { FileUtil.expandUserHome(it) }
      if (path != null) {
        var file = Paths.get(path)
        repeat(1000) {
          if (!Files.exists(file)) return file
          file = Paths.get(path + "-" + (it + 1))
        }
      }
      return service<RuntimeChooserJbrInstaller>().defaultInstallDir(item)
    }
  }

  @Service(Service.Level.APP)
  private class RuntimeChooserJbrListDownloader : JdkListDownloaderBase() {
    override val feedUrl: String
      get() {
        val registry = runCatching { Registry.get("runtime.chooser.url").asString() }.getOrNull()
        if (!registry.isNullOrBlank()) return registry

        val majorVersion =
            runCatching { Registry.get("runtime.chooser.pretend.major").asInteger() }.getOrNull()
                ?: ApplicationInfo.getInstance().build.components.firstOrNull()

        return "https://download.jetbrains.com/jdk/feed/v1/jbr-choose-runtime-${majorVersion}.json.xz"
      }
  }
}

class JcefRuntimeNotification :
    Notification(
        NotificationGroups.SOURCEGRAPH_ERRORS,
        CodyBundle.getString("JcefRuntimeNotification.title"),
        CodyBundle.getString("JcefRuntimeNotification.content"),
        NotificationType.WARNING),
    NotificationFullContent {

  init {
    icon = Icons.CodyLogoSlash

    addAction(
        object : NotificationAction(CodyBundle.getString("switchToJcefRuntime.button")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            VerifyJavaBootRuntimeVersion.chooseJcefRuntimeAutomatically()
            notification.expire()
          }
        })

    addAction(
        object : NotificationAction(CodyBundle.getString("chooseRuntimeWithJcef.button")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            RuntimeChooserUtil.showRuntimeChooserPopup()
            notification.expire()
          }
        })
  }
}
