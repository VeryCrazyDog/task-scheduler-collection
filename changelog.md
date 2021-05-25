# Changelog
All notable changes to this module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this module adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2021-05-25
### Added
- Added `SingleInstanceTaskScheduler.nextRunTime` property.

### Changed
- In `SingleInstanceTaskScheduler` constructor options, rename `nextRunTimeEvaluator`
  to `nextRunTime` and accept the same options as `buildEvaluator`.
- Export is changed. Instead of `require('task-scheduler-collection')`, use
  `require('task-scheduler-collection/single-instance')`.
- In `SingleInstanceTaskScheduler`, `NextRunRequest.startTime` is renamed to `NextRunRequest.startDelayOrTime`
  to avoid ambiguity.

### Removed
- `ExecutionMetadata.isRetry` is removed as this can be deduced from `ExecutionMetadata.attemptNumber !== 1`.

## [0.1.0] - 2021-05-24
### Added
- First release with `SingleInstanceTaskScheduler`.



[Unreleased]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/0.2.0...HEAD
[0.2.0]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/VeryCrazyDog/task-scheduler-collection/releases/tag/0.1.0
