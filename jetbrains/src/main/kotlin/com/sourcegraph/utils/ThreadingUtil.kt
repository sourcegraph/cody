package com.sourcegraph.utils

import com.intellij.openapi.application.ApplicationManager
import java.util.concurrent.CancellationException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException

object ThreadingUtil {

  fun <T> runInBackground(task: () -> T): CompletableFuture<T> {
    val future = CompletableFuture<T>()

    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        future.complete(task())
      } catch (e: CancellationException) {
        future.cancel(true)
      } catch (e: ExecutionException) {
        future.completeExceptionally(e.cause ?: e)
      } catch (e: Exception) {
        future.completeExceptionally(e)
      }
    }

    return future
  }

  fun <T> runInEdtAndGet(task: () -> T): T {
    if (ApplicationManager.getApplication().isDispatchThread) {
      return task()
    }

    return runInEdtFuture { task() }.get()
  }

  fun <R> runInEdtFuture(task: (() -> R)): CompletableFuture<R> {

    val future = CompletableFuture<R>()
    ApplicationManager.getApplication().invokeLater {
      try {
        future.complete(task())
      } catch (e: CancellationException) {
        future.cancel(true)
      } catch (e: ExecutionException) {
        future.completeExceptionally(e.cause ?: e)
      } catch (e: Exception) {
        future.completeExceptionally(e)
      }
    }
    return future
  }
}
