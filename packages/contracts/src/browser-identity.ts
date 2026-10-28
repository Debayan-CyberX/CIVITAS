import type { RuntimeIdentity } from './engine';
export function browserIdentity(build: string, userAgent: string): RuntimeIdentity {
  const firefox = /Firefox\/([\d.]+)/.exec(userAgent);
  const chromium = /(?:Chrome|Chromium)\/([\d.]+)/.exec(userAgent);
  const webkit = /AppleWebKit\/([\d.]+)/.exec(userAgent);
  return {
    engineVersion: 'engine/0.2.0',
    engineBuildSha: build,
    runtimeEngine: firefox ? 'SPIDERMONKEY' : chromium ? 'V8' : 'JAVASCRIPTCORE',
    runtimeVersion: `${firefox ? 'Firefox' : chromium ? 'Chromium' : 'WebKit'}-${firefox?.[1] ?? chromium?.[1] ?? webkit?.[1] ?? 'unknown'}`,
    platform: /Windows/.test(userAgent)
      ? 'Windows'
      : /Mac/.test(userAgent)
        ? 'MacOS'
        : /Linux/.test(userAgent)
          ? 'Linux'
          : 'unknown',
    numericContractVersion: 'kinematics/1',
  };
}
