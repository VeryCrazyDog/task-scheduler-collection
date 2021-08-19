# Changelog
All notable changes to this module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this module adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2021-08-19
### Fixed
- Fix no retry will be executed in `SingleInstanceTaskScheduler` when `schedule()` or
  `run()` is called after first retry.

## [1.1.0] - 2021-07-28
### Added
- Added read only property `SingleInstanceTaskScheduler.context`.

## [1.0.1] - 2021-07-21
### Fixed
- Fix broken package by repacking and republish.

## [1.0.0] - 2021-07-20
### Changed
- `SingleInstanceTaskScheduler` is rewrote with stability index *2 - Stable*.

## [0.3.0] - 2021-05-27
### Added
- Added method `SingleInstanceTaskScheduler.setNextRunTimeOptions()`.

### Changed
- Export is changed again. `require('task-scheduler-collection/dist/single-instance')`
  should now be changed to `require('task-scheduler-collection/single-instance')`.
- Change constructor signiture of `SingleInstanceTaskScheduler` to make it easier to use.

### Removed
- Marked function `buildEvaluator` in `single-instance` module as private by adding
  underscore prefix. Export will be removed in future.
- Package on npm no longer include TypeScript source and `tsconfig.json`.

## [0.2.0] - 2021-05-25
### Added
- Added `SingleInstanceTaskScheduler.nextRunTime` property.

### Changed
- In `SingleInstanceTaskScheduler` constructor options, rename `nextRunTimeEvaluator`
  to `nextRunTime` and accept the same options as `buildEvaluator`.
- Export is changed. Instead of `const { SingleInstanceTaskScheduler } = require('task-scheduler-collection')`,
  use `const { SingleInstanceTaskScheduler } = require('task-scheduler-collection/dist/single-instance')`.
- In `SingleInstanceTaskScheduler`, `NextRunRequest.startTime` is renamed to `NextRunRequest.startDelayOrTime`
  to avoid ambiguity.

### Removed
- `ExecutionMetadata.isRetry` is removed as this can be deduced from `ExecutionMetadata.attemptNumber !== 1`.

## [0.1.0] - 2021-05-24
### Added
- First release with `SingleInstanceTaskScheduler`.



[Unreleased]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/1.1.1...HEAD
[1.1.1]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/1.0.1...1.1.0
[1.0.1]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/0.3.0...1.0.0
[0.3.0]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/VeryCrazyDog/task-scheduler-collection/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/VeryCrazyDog/task-scheduler-collection/releases/tag/0.1.0
