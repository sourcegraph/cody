pluginManagement {
    plugins {
        kotlin("jvm") version "1.9.23"
    }
}
rootProject.name = "Sourcegraph"

plugins { id("org.gradle.toolchains.foojay-resolver-convention") version ("0.4.0") }

val isCiServer = System.getenv().containsKey("CI")

buildCache { local { isEnabled = !isCiServer } }
