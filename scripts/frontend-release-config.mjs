import { validateReleaseConfig, formatValidation, validReleaseOrigin } from './validate-release-config.mjs';

// Next config/build tooling only. Never import into src/ or expose env via Next's
// `env` setting. NEXT_PUBLIC values are supplied explicitly by the build operator.
/** @returns {{ source: string, destination: string, basePath?: false }[]} */
export function frontendReleaseConfig(env, scope, nodeVersion = process.version) {
  if (!['dashboard', 'admin'].includes(scope)) throw new Error('Unknown frontend scope');
  const development = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  if (!development) {
    const result = validateReleaseConfig(env, { scope, mode: 'production', nodeVersion });
    if (!result.ok) throw new Error(formatValidation(result));
  }
  // API_ORIGIN (server only) is where the API really runs. NEXT_PUBLIC_API_URL is what
  // browsers call; on the single public domain that is the Customer site itself.
  const origin = env.API_ORIGIN || env.NEXT_PUBLIC_API_URL || (development ? 'http://localhost:5002' : '');
  if (!validReleaseOrigin(origin, development ? 'test' : 'production')) throw new Error('API_ORIGIN / NEXT_PUBLIC_API_URL must be a canonical backend origin');
  const paths = scope === 'dashboard' ? ['api', 'daas'] : ['api'];
  // The Admin app lives under /admin; its API calls stay at the domain root (/api).
  return paths.map(path => ({ source: `/${path}/:path*`, destination: `${origin}/${path}/:path*`, ...(scope === 'admin' ? { basePath: false } : {}) }));
}
