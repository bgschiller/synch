# Next Obsidian plugin release

## Added

- Sync diagnostics now include the build commit and attach the underlying error to per-file sync failures, so it is easier to confirm which build a device is running and diagnose failed files.

## Changed

## Fixed

- Fixed a crash during first sync between devices where markdown notes could fail with a "detached ArrayBuffer" error while caching files in the background.
- Prevent other editors’ cursor names from becoming document text when backspacing on mobile.
