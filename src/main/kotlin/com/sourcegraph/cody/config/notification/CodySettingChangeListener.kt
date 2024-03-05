package com.sourcegraph.cody.config.notification

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.CodyToolWindowFactory
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.autocomplete.render.AutocompleteRenderUtil
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CollectionUtil.Companion.diff
import java.util.function.Consumer

@Service(Service.Level.PROJECT)
class CodySettingChangeListener(project: Project) : ChangeListener(project) {
  init {
    connection.subscribe(
        CodySettingChangeActionNotifier.TOPIC,
        object : CodySettingChangeActionNotifier {
          override fun afterAction(context: CodySettingChangeContext) {
            // Notify JCEF about the config changes
            javaToJSBridge?.callJS("pluginSettingsChanged", ConfigUtil.getConfigAsJson(project))

            if (context.oldCodyEnabled != context.newCodyEnabled) {
              if (context.newCodyEnabled) {
                CodyAgentService.getInstance(project).startAgent(project)
              } else {
                CodyAgentService.getInstance(project).stopAgent(project)
              }
            }

            // Notify Cody Agent about config changes.
            CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
              if (ConfigUtil.isCodyEnabled()) {
                agent.server.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
              }
            }

            // clear autocomplete suggestions if freshly disabled
            if (context.oldCodyAutocompleteEnabled && !context.newCodyAutocompleteEnabled) {
              CodyAutocompleteManager.instance.clearAutocompleteSuggestionsForAllProjects()
            }

            // Disable/enable the Cody tool window depending on the setting
            if (!context.newCodyEnabled && context.oldCodyEnabled) {
              val toolWindowManager = ToolWindowManager.getInstance(project)
              val toolWindow = toolWindowManager.getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
              toolWindow?.setAvailable(false, null)
            } else if (context.newCodyEnabled && !context.oldCodyEnabled) {
              val toolWindowManager = ToolWindowManager.getInstance(project)
              val toolWindow = toolWindowManager.getToolWindow(CodyToolWindowFactory.TOOL_WINDOW_ID)
              toolWindow?.setAvailable(true, null)
            }

            CodyStatusService.resetApplication(project)

            // Rerender autocompletions when custom autocomplete color changed
            // or when checkbox state changed
            if (context.oldCustomAutocompleteColor != context.customAutocompleteColor ||
                (context.oldIsCustomAutocompleteColorEnabled !=
                    context.isCustomAutocompleteColorEnabled)) {
              ConfigUtil.getAllEditors()
                  .forEach(Consumer { AutocompleteRenderUtil.rerenderAllAutocompleteInlays(it) })
            }

            // clear autocomplete inlays for blacklisted language editors
            val languageIdsToClear: List<String> =
                context.newBlacklistedAutocompleteLanguageIds.diff(
                    context.oldBlacklistedAutocompleteLanguageIds)
            if (languageIdsToClear.isNotEmpty())
                CodyAutocompleteManager.instance.clearAutocompleteSuggestionsForLanguageIds(
                    languageIdsToClear)

            if (context.oldShouldAcceptNonTrustedCertificatesAutomatically !=
                context.newShouldAcceptNonTrustedCertificatesAutomatically)
                CodyAgentService.getInstance(project).restartAgent(project)
          }
        })
  }
}
