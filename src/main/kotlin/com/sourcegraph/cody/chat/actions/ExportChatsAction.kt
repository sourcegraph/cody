package com.sourcegraph.cody.chat.actions

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.application.invokeLater
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.fileChooser.FileSaverDialog
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.jetbrains.rd.util.AtomicReference
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.chat.ExportChatsBackgroundable
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.common.ui.DumbAwareEDTAction

class ExportChatsAction : DumbAwareEDTAction() {

  override fun update(e: AnActionEvent) {
    super.update(e)
    e.presentation.isEnabled = !isRunning.get()
    e.presentation.description =
        if (!isRunning.get()) "Export in progress..." else "Export Chats As JSON"
  }

  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val internalId = e.getData(INTERNAL_ID_DATA_KEY)
    isRunning.getAndSet(true)

    val token = CancellationToken()
    token.onFinished { isRunning.getAndSet(false) }

    var outputDir: VirtualFile? = project.guessProjectDir()
    if (outputDir == null || !outputDir.exists()) {
      outputDir = VfsUtil.getUserHomeDir()
    }

    val descriptor = FileSaverDescriptor("Cody: Export Chats", "Save as *.$EXTENSION", EXTENSION)

    val saveFileDialog: FileSaverDialog =
        FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project)

    // Append extension manually to file name on MacOS because FileSaverDialog does not
    // do it automatically.
    val fileName: String = "Untitled" + (if (SystemInfo.isMac) ".$EXTENSION" else "")

    val result = saveFileDialog.save(outputDir, fileName)

    if (result == null) {
      token.abort() // User canceled the file save dialog
      return
    }

    CodyAgentService.withAgent(project) { agent ->
      ExportChatsBackgroundable(
              project,
              agent = agent,
              internalId = internalId,
              onSuccess = { chatHistory ->
                val json = gson.toJson(chatHistory)
                invokeLater {
                  WriteAction.run<RuntimeException> {
                    result.getVirtualFile(true)?.setBinaryContent(json.toByteArray())
                    VirtualFileManager.getInstance().syncRefresh()
                  }
                }
              },
              cancellationToken = token)
          .queue()
    }
  }

  companion object {
    val gson: Gson = GsonBuilder().create()
    var isRunning = AtomicReference(false)

    const val EXTENSION = "json"
    val INTERNAL_ID_DATA_KEY = DataKey.create<String?>("internalId")
  }
}
