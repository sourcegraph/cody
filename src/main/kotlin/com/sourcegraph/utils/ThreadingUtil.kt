package com.sourcegraph.utils

import com.intellij.openapi.application.ApplicationManager
import java.awt.EventQueue.invokeAndWait
import java.util.concurrent.CompletableFuture

object ThreadingUtil {

  fun <T> runInEdtAndGet(task: () -> T): T {
    val app = ApplicationManager.getApplication()
    if (app.isDispatchThread) {
      return task()
    }
    val future = CompletableFuture<T>()
    invokeAndWait {
      try {
        future.complete(task())
      } catch (exception: Exception) {
        future.completeExceptionally(exception)
      }
    }
    return future.get()
  }
}
