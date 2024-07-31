package com.sourcegraph.cody.edit

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.protocol.TextEdit
import com.sourcegraph.cody.agent.protocol.WorkspaceEditParams
import com.sourcegraph.utils.CodyEditorUtil

@Service(Service.Level.PROJECT)
class EditService(val project: Project) {
  val logger = Logger.getInstance(TextEdit::class.java)

  /**
   * Applies a list of text edits to the specified file.
   *
   * @param uri The URI of the file to apply the edits to.
   * @param edits The list of text edits to apply.
   * @return `true` if all edits were successfully applied, `false` otherwise.
   */
  fun performTextEdits(uri: String, edits: List<TextEdit>): Boolean {
    val file =
        CodyEditorUtil.findFileOrScratch(project, uri)
            ?: run {
              logger.warn("Failed to find file for URI: $uri")
              return false
            }
    val document =
        FileDocumentManager.getInstance().getDocument(file)
            ?: run {
              logger.warn("Failed to get document for file: ${file.name}")
              return false
            }

    return WriteCommandAction.runWriteCommandAction<Boolean>(project) {
      edits.reversed().all { edit ->
        when (edit.type) {
          "replace",
          "delete" -> {
            if (edit.range != null) {
              document.replaceString(
                  edit.range.start.toOffset(document),
                  edit.range.end.toOffset(document),
                  edit.value ?: "")
              true
            } else {
              logger.warn("Edit range is null for ${edit.type} operation")
              false
            }
          }
          "insert" -> {
            if (edit.position != null) {
              document.insertString(edit.position.toOffset(document), edit.value ?: "")
              true
            } else {
              logger.warn("Edit position is null for insert operation")
              false
            }
          }
          else -> {
            logger.warn("Unknown edit type: ${edit.type}")
            false
          }
        }
      }
    }
  }

  fun performWorkspaceEdit(workspaceEditParams: WorkspaceEditParams): Boolean {
    return workspaceEditParams.operations.all { op ->
      // TODO: We need to support the file-level operations.
      when (op.type) {
        "create-file" -> {
          logger.warn("Workspace edit operation created a file: ${op.uri}")
          return false
        }
        "rename-file" -> {
          logger.warn("Workspace edit operation renamed a file: ${op.oldUri} -> ${op.newUri}")
          return false
        }
        "delete-file" -> {
          logger.warn("Workspace edit operation deleted a file: ${op.uri}")
          return false
        }
        "edit-file" -> {
          if (op.edits == null) {
            logger.warn("Workspace edit operation has no edits")
            return false
          } else if (op.uri == null) {
            logger.warn("Workspace edit operation has null uri")
            return false
          } else {
            logger.info("Applying workspace edit to a file: ${op.uri}")
            performTextEdits(op.uri, op.edits)
          }
        }
        else -> {
          logger.warn(
              "DocumentCommand session received unknown workspace edit operation: ${op.type}")
          return false
        }
      }
    }
  }

  companion object {
    fun getInstance(project: Project): EditService {
      return project.service<EditService>()
    }
  }
}
