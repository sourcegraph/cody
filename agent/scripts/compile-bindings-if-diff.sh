git fetch origin main
if [ $(git diff --name-only origin/main | wc -l) -gt 0 ]; then
  cd agent/bindings/kotlin
  ./gradlew compileKotlin
fi
