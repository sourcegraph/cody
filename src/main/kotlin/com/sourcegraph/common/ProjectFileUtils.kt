package com.sourcegraph.common

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.util.Computable
import com.intellij.openapi.vfs.VirtualFile
import java.io.File

object ProjectFileUtils {
  fun getRelativePathToProjectRoot(project: Project, file: VirtualFile): String? {
    val rootForFile =
        ApplicationManager.getApplication()
            .runReadAction(
                Computable { ProjectFileIndex.getInstance(project).getContentRootForFile(file) })
    return if (rootForFile != null) {
      File(rootForFile.path).toURI().relativize(File(file.path).toURI()).getPath()
    } else null
  }
}
