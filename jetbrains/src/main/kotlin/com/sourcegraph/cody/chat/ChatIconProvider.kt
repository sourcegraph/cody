package com.sourcegraph.cody.chat

import com.intellij.ide.FileIconProvider
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.Icons
import com.sourcegraph.cody.ui.web.WebPanelFileType
import javax.swing.Icon

class ChatIconProvider : FileIconProvider {

  override fun getIcon(file: VirtualFile, flags: Int, project: Project?): Icon? {
    if (file.fileType == WebPanelFileType.INSTANCE) {
      return Icons.CodyLogo
    }
    return null
  }
}
