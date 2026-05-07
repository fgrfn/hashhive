# Changelog

## [1.4.0](https://github.com/fgrfn/hashhive/compare/v1.3.0...v1.4.0) (2026-05-07)


### Features

* implement design features from Hive OS prototype ([61af4d4](https://github.com/fgrfn/hashhive/commit/61af4d47c9b14332dc726a1defb0c9c56e7a3aa6))
* implement Hive OS design — Groups, Schedules, Wallets, Earnings, Device Detail ([cce5776](https://github.com/fgrfn/hashhive/commit/cce5776733a9405843fb45b829c07135a1d0030d))
* improve CI/CD pipeline and add update/downgrade UI ([#22](https://github.com/fgrfn/hashhive/issues/22)) ([b68adb4](https://github.com/fgrfn/hashhive/commit/b68adb4e91a6df8c439456adc25e3ad9ad5c24be))
* NerdMiner/SparkMiner support + Pool-Dashboard-Links ([67d6a8f](https://github.com/fgrfn/hashhive/commit/67d6a8fb0a2242ac87dbde6c66a7571fa7c82076))


### Bug Fixes

* ckpool.org Pool-Link auf eusolostats.ckpool.org korrigiert ([a0a30a2](https://github.com/fgrfn/hashhive/commit/a0a30a2205f3b314b021caac69bf24df44cb99df))
* create /run/secrets dir to suppress pydantic_settings warning ([01e4231](https://github.com/fgrfn/hashhive/commit/01e4231fe28038339462b81282a56613cb8cc76c))

## [1.3.0](https://github.com/fgrfn/hashhive/compare/v1.2.0...v1.3.0) (2026-05-07)


### Features

* implement design features from Hive OS prototype ([61af4d4](https://github.com/fgrfn/hashhive/commit/61af4d47c9b14332dc726a1defb0c9c56e7a3aa6))
* implement Hive OS design — Groups, Schedules, Wallets, Earnings, Device Detail ([cce5776](https://github.com/fgrfn/hashhive/commit/cce5776733a9405843fb45b829c07135a1d0030d))
* NerdMiner/SparkMiner support + Pool-Dashboard-Links ([67d6a8f](https://github.com/fgrfn/hashhive/commit/67d6a8fb0a2242ac87dbde6c66a7571fa7c82076))


### Bug Fixes

* ckpool.org Pool-Link auf eusolostats.ckpool.org korrigiert ([a0a30a2](https://github.com/fgrfn/hashhive/commit/a0a30a2205f3b314b021caac69bf24df44cb99df))
* create /run/secrets dir to suppress pydantic_settings warning ([01e4231](https://github.com/fgrfn/hashhive/commit/01e4231fe28038339462b81282a56613cb8cc76c))

## [1.2.0](https://github.com/fgrfn/hashhive/compare/v1.1.1...v1.2.0) (2026-05-06)


### Features

* implement design features from Hive OS prototype ([61af4d4](https://github.com/fgrfn/hashhive/commit/61af4d47c9b14332dc726a1defb0c9c56e7a3aa6))
* implement Hive OS design — Groups, Schedules, Wallets, Earnings, Device Detail ([cce5776](https://github.com/fgrfn/hashhive/commit/cce5776733a9405843fb45b829c07135a1d0030d))

## [1.1.1](https://github.com/fgrfn/hashhive/compare/v1.1.0...v1.1.1) (2026-04-10)


### Bug Fixes

* ckpool.org Pool-Link auf eusolostats.ckpool.org korrigiert ([a0a30a2](https://github.com/fgrfn/hashhive/commit/a0a30a2205f3b314b021caac69bf24df44cb99df))

## [1.1.0](https://github.com/fgrfn/hashhive/compare/v1.0.1...v1.1.0) (2026-04-09)


### Features

* NerdMiner/SparkMiner support + Pool-Dashboard-Links ([67d6a8f](https://github.com/fgrfn/hashhive/commit/67d6a8fb0a2242ac87dbde6c66a7571fa7c82076))


### Bug Fixes

* create /run/secrets dir to suppress pydantic_settings warning ([01e4231](https://github.com/fgrfn/hashhive/commit/01e4231fe28038339462b81282a56613cb8cc76c))

## [1.0.1](https://github.com/fgrfn/hashhive/compare/v1.0.0...v1.0.1) (2026-04-05)


### Bug Fixes

* Before posting, we now first GET the device's current full config, then spread it as the base (...rawNmCfg) and override only the pool fields on top — identical to how saveNmEdit() works. ([8ac2bcb](https://github.com/fgrfn/hashhive/commit/8ac2bcbfed2cf5e294caec0f25c165d602f5843d))
