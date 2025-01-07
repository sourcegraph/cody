package com.sourcegraph.cody.edit.lenses

import com.intellij.codeInsight.codeVision.CodeVisionHost
import com.intellij.codeInsight.codeVision.CodeVisionInitializer
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.agent.protocol_generated.ProtocolCodeLens
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import java.awt.Point

typealias TaskId = String

interface LensListener {
  fun onLensesUpdate(vf: VirtualFile, codeLenses: List<ProtocolCodeLens>)
}

@Service(Service.Level.PROJECT)
class LensesService(val project: Project) {
  @Volatile private var lensGroups = mutableMapOf<VirtualFile, List<ProtocolCodeLens>>()

  private val listeners = mutableListOf<LensListener>()

  fun getTaskIdsOfFirstVisibleLens(editor: Editor): TaskId? {
    val lenses =
        getLenses(editor)
            .sortedBy { it.range.start.line }
            .filter { it.command?.arguments?.isNotEmpty() == true }

    val cmd =
        if (ConfigUtil.isIntegrationTestModeEnabled()) {
          // Unfortunately headless mode does not seem to properly support `scrollingModel` so for
          // tests we just return first available lens
          lenses.firstOrNull()?.command
        } else {
          val visibleArea = editor.scrollingModel.visibleArea
          val startPosition = editor.xyToVisualPosition(visibleArea.location)
          val endPosition =
              editor.xyToVisualPosition(
                  Point(visibleArea.x + visibleArea.width, visibleArea.y + visibleArea.height))
          lenses.find { it.range.start.line in (startPosition.line..endPosition.line) }?.command
        }

    val taskId = (cmd?.arguments?.firstOrNull() as com.google.gson.JsonPrimitive?)?.asString
    return taskId
  }

  fun addListener(listener: LensListener) {
    listeners.add(listener)
  }

  fun removeListener(listener: LensListener) {
    listeners.remove(listener)
  }

  fun updateLenses(uriString: String, codeLens: List<ProtocolCodeLens>) {
    val vf = CodyEditorUtil.findFileOrScratch(project, uriString) ?: return
    synchronized(this) { lensGroups[vf] = codeLens }

    runInEdt {
      if (project.isDisposed) return@runInEdt
      // Find the specific editor matching the file
      CodyEditorUtil.getAllOpenEditors()
          .find { editor -> editor.virtualFile == vf }
          ?.let { matchingEditor ->
            CodeVisionInitializer.getInstance(project)
                .getCodeVisionHost()
                .invalidateProvider(
                    CodeVisionHost.LensInvalidateSignal(
                        matchingEditor, EditCodeVisionProvider.allEditProviders().map { it.id }))
          }
    }
    listeners.forEach { it.onLensesUpdate(vf, codeLens) }
  }

  fun getLenses(editor: Editor): List<ProtocolCodeLens> {
    val vf = editor.virtualFile

    synchronized(this) {
      return lensGroups[vf] ?: emptyList()
    }
  }

  companion object {
    fun getInstance(project: Project): LensesService {
      return project.service<LensesService>()
    }
  }
}
