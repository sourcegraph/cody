package com.sourcegraph.cody.initialization

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.util.lang.UrlClassLoader

object ActionUpdateThreadClassloaderPatcher {
  init {
    val appInfo = ApplicationInfo.getInstance()
    if (appInfo.majorVersion == "2022" && appInfo.minorVersion <= "1") {
      val classloader = this.javaClass.classLoader as? UrlClassLoader
      classloader?.getResource("lib/ActionUpdateThread.jar")?.let { classloader.addURL(it) }
    }
  }
}
