package com.sourcegraph.utils

import com.intellij.openapi.application.ApplicationManager
import java.util.concurrent.CompletableFuture

object ThreadingUtil {

  fun <T> runInEdtAndGet(task: () -> T): T {
    val app = ApplicationManager.getApplication()
    if (app.isDispatchThread) {
      return task()
    }
    val future = CompletableFuture<T>()
    app.invokeLater {
      try {
        future.complete(task())
      } catch (exception: Throwable) {
        future.completeExceptionally(exception)
      }
    }
    return future.get()
  }
}
