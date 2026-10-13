# Third-party dependencies

Vendored unmodified headers and MIT licenses. Builds do not need network access.

| Component | Version | Source | License |
| --- | --- | --- | --- |
| cpp-httplib | 0.18.7 | https://github.com/yhirose/cpp-httplib/tree/v0.18.7 | `httplib/LICENSE` (MIT) |
| nlohmann/json | 3.12.0 | https://github.com/nlohmann/json/tree/v3.12.0 | `json/LICENSE.MIT` (MIT) |

Only plain loopback HTTP is enabled; no TLS/compression dependencies are used.

Header SHA-256:

- httplib.h: `4770f8ea3d3fcd27b0b713c783d9b53bce3baddbd5adad13714011df96142526`
- json.hpp: `aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63`
