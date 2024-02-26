package com.sourcegraph.common

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.sourcegraph.common.BrowserErrorNotification.show
import com.sourcegraph.config.ConfigUtil.getServerPath
import java.awt.Desktop
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException

object BrowserOpener {
  fun openRelativeUrlInBrowser(project: Project, relativeUrl: String) {
    openInBrowser(project, getServerPath(project).url + "/" + relativeUrl)
  }

  fun openInBrowser(project: Project?, absoluteUrl: String) {
    try {
      openInBrowser(project, URI(absoluteUrl))
    } catch (e: URISyntaxException) {
      val logger = Logger.getInstance(BrowserOpener::class.java)
      logger.warn("Error while creating URL from \"" + absoluteUrl + "\": " + e.message)
    }
  }

  fun openInBrowser(project: Project?, uri: URI) {
    try {
      BrowserUtil.browse(uri)
    } catch (e: Exception) {
      try {
        Desktop.getDesktop().browse(uri)
      } catch (e2: IOException) {
        show(project, uri)
      } catch (e2: UnsupportedOperationException) {
        show(project, uri)
      }
    }
  }
}
