package com.sourcegraph.cody.initialization

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.project.Project
import com.intellij.util.lang.ClassPath
import com.intellij.util.lang.UrlClassLoader
import kotlin.io.path.name
import kotlin.reflect.full.memberFunctions
import kotlin.reflect.jvm.javaMethod

class ActionUpdateThreadClassloaderPatcher : Activity {
  override fun runActivity(project: Project) {
    val appInfo = ApplicationInfo.getInstance()
    if (appInfo.majorVersion > "2022" || appInfo.minorVersion > "1") {
      val classloader = this.javaClass.classLoader as? UrlClassLoader ?: return
      val resetMethod =
          ClassPath::class
              .memberFunctions
              .find { it.name == "reset" && it.parameters.size == 2 }
              ?.javaMethod
      val urls = classloader.baseUrls.filterNot { it?.name == "ActionUpdateThread.jar" }
      resetMethod?.trySetAccessible()
      resetMethod?.invoke(classloader.classPath, urls)
    }
  }
}
