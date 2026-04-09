# Changelog

## [1.1.0](https://github.com/fgrfn/hashhive/compare/v1.0.1...v1.1.0) (2026-04-09)


### Features

* NerdMiner/SparkMiner support + Pool-Dashboard-Links ([67d6a8f](https://github.com/fgrfn/hashhive/commit/67d6a8fb0a2242ac87dbde6c66a7571fa7c82076))


### Bug Fixes

* create /run/secrets dir to suppress pydantic_settings warning ([01e4231](https://github.com/fgrfn/hashhive/commit/01e4231fe28038339462b81282a56613cb8cc76c))

## [1.0.1](https://github.com/fgrfn/hashhive/compare/v1.0.0...v1.0.1) (2026-04-05)


### Bug Fixes

* Before posting, we now first GET the device's current full config, then spread it as the base (...rawNmCfg) and override only the pool fields on top — identical to how saveNmEdit() works. ([8ac2bcb](https://github.com/fgrfn/hashhive/commit/8ac2bcbfed2cf5e294caec0f25c165d602f5843d))
