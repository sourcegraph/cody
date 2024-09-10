package com.sourcegraph.utils

import java.util.concurrent.CompletableFuture
import javax.swing.SwingUtilities.invokeAndWait

object ThreadingUtil {

  fun <T> runInEdtAndGet(task: () -> T): T {
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
