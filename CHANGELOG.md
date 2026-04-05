# Changelog

## [1.0.1](https://github.com/fgrfn/hashhive/compare/v1.0.0...v1.0.1) (2026-04-05)


### Bug Fixes

* Before posting, we now first GET the device's current full config, then spread it as the base (...rawNmCfg) and override only the pool fields on top — identical to how saveNmEdit() works. ([8ac2bcb](https://github.com/fgrfn/hashhive/commit/8ac2bcbfed2cf5e294caec0f25c165d602f5843d))
