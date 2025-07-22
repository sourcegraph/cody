rootProject.name = "Sourcegraph"

plugins { id("org.gradle.toolchains.foojay-resolver-convention") version ("1.0.0") }

val isCiServer = System.getenv().containsKey("CI")

buildCache { local { isEnabled = !isCiServer } }
