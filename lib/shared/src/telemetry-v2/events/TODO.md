@rnauta I'll refactor this object soon as it's not super ergonomic to read at
the moment and especially frustrating that 'goto definition' doesn't work. I
found a nice TS workaround though which I used for env variables
`lib/shared/src/configuration/environment.ts` that we can apply here too which
should make it a lot nicer.
