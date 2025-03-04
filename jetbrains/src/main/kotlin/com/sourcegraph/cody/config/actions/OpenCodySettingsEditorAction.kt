package com.sourcegraph.cody.config.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.io.write
import com.jetbrains.jsonSchema.JsonSchemaMappingsProjectConfiguration
import com.jetbrains.jsonSchema.UserDefinedJsonSchemaConfiguration
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import com.jetbrains.jsonSchema.impl.JsonSchemaVersion
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.common.ui.DumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import kotlin.io.path.name

class OpenCodySettingsEditorAction : DumbAwareEDTAction("Open Cody Settings Editor") {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return

    val settingsVf =
        CodyEditorUtil.createFileOrScratchFromUntitled(
            project, ConfigUtil.getSettingsFile(project).toUri().toString(), content = "{\n  \n}")
            ?: run {
              logger.warn("Could not create settings file")
              return
            }

    CodyEditorUtil.showDocument(project, settingsVf)

    reloadSchemaAsync(project)
  }

  private fun reloadSchemaAsync(project: Project) {
    CodyAgentService.withServerRestartIfNeeded(project) { server ->
      val settingsSchema = server.extensionConfiguration_getSettingsSchema(null).get()

      val schemaFile = ConfigUtil.getConfigDir(project).resolve("cody_settings.schema.json")
      schemaFile.write(settingsSchema)
      LocalFileSystem.getInstance().refreshAndFindFileByNioFile(schemaFile)

      val configName = "Cody Settings"
      val schemaConfig =
          UserDefinedJsonSchemaConfiguration(
              configName,
              JsonSchemaVersion.SCHEMA_7,
              schemaFile.toString(),
              /* applicationDefined = */ false,
              listOf(
                  UserDefinedJsonSchemaConfiguration.Item(
                      "*/${ConfigUtil.getSettingsFile(project).name}",
                      /* isPattern = */ true,
                      /* isDirectory = */ false)))

      val schemaMapping = JsonSchemaMappingsProjectConfiguration.getInstance(project)

      schemaMapping.stateMap
          .filter { it.value.name == configName }
          .forEach { schemaMapping.removeConfiguration(it.value) }
      schemaMapping.addConfiguration(schemaConfig)
      JsonSchemaService.Impl.get(project).reset()
    }
  }

  companion object {
    private val logger = Logger.getInstance(OpenCodySettingsEditorAction::class.java)
  }
}
