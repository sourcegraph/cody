package com.sourcegraph.cody.error

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.components.Service
import com.intellij.openapi.util.SystemInfo
import com.sourcegraph.config.ConfigUtil
import io.sentry.Sentry
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import io.sentry.SentryOptions
import io.sentry.protocol.Message
import io.sentry.protocol.User
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.*

@Service(Service.Level.APP)
class SentryService {
  companion object {
    private const val CODY_NAMESPACE = "com.sourcegraph"
    private const val DAYS_TO_LOG_TO_SENTRY = 180
    private const val SENTRY_DSN =
        "https://632ba95dd79413f3f6e95f48007e5b65@o19358.ingest.us.sentry.io/4508886063644672"

    fun initialize() {
      val version = ConfigUtil.getPluginVersion()
      val env =
          when {
            version.endsWith("localbuild") -> "dev"
            version.endsWith("nightly") -> "nightly"
            else -> "stable"
          }

      Sentry.init { options ->
        options.dsn = SENTRY_DSN
        options.isGlobalHubMode = true
        options.isSendDefaultPii = true
        options.inAppIncludes.add(CODY_NAMESPACE)
        options.maxBreadcrumbs = 50
        options.environment = env
        options.release = "cody-jb@$version"

        options.beforeSend =
            SentryOptions.BeforeSendCallback { event: SentryEvent, _ ->
              if (event.message != null) return@BeforeSendCallback event
              if (event.exceptions == null) return@BeforeSendCallback event

              for (ex in event.exceptions!!) {
                if (ex.module?.startsWith(CODY_NAMESPACE) == true) return@BeforeSendCallback event
                val frames = ex.stacktrace?.frames
                if (frames != null) {
                  for (frame in frames) {
                    if (frame.module?.startsWith(CODY_NAMESPACE) == true)
                        return@BeforeSendCallback event
                  }
                }
              }

              null
            }
      }

      val appInfo = ApplicationInfo.getInstance()
      Sentry.configureScope {
        it.setTag("ideBuild", appInfo.build.toString())
        it.setTag("ideVersionName", appInfo.versionName)
        it.setTag("ideVersion", appInfo.fullVersion)
        it.setTag("system", SystemInfo.OS_NAME)
        it.setTag("systemVersion", SystemInfo.OS_VERSION)
      }
    }

    fun setUser(email: String?, userName: String) {
      val user =
          User().apply {
            this.email = email
            username = userName
          }
      Sentry.setUser(user)
    }

    fun isPluginToOldForSentryLogging(): Boolean {
      val now = Date()
      val releaseDate = ConfigUtil.getPluginReleaseDate() ?: now
      val releaseDateLocal = releaseDate.toInstant().atZone(ZoneId.systemDefault()).toLocalDate()
      val currentDateLocal = now.toInstant().atZone(ZoneId.systemDefault()).toLocalDate()

      val daysBetween = ChronoUnit.DAYS.between(releaseDateLocal, currentDateLocal)
      return daysBetween > DAYS_TO_LOG_TO_SENTRY
    }

    fun report(throwable: Throwable) {
      Sentry.captureException(throwable)
    }

    fun report(throwable: Throwable?, message: String?, context: Any?) {
      val sentryEvent =
          SentryEvent().apply {
            this.message = Message().apply { this.message = message }
            level = SentryLevel.ERROR
            this.throwable = throwable
            if (context != null) {
              contexts.set("IDE Information", context)
            }
          }

      Sentry.captureEvent(sentryEvent)
    }
  }
}
