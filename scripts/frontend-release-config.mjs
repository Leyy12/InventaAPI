import { validateReleaseConfig, formatValidation, validReleaseOrigin } from './validate-release-config.mjs';

// Next config/build tooling only. Never import into src/ or expose env via Next's
// `env` setting. NEXT_PUBLIC values are supplied explicitly by the build operator.
export function frontendReleaseConfig(env, scope, nodeVersion = process.version) {
  if (!['dashboard', 'admin'].includes(scope)) throw new Error('Unknown frontend scope');
  const development = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  if (!development) {
    const result = validateReleaseConfig(env, { scope, mode: 'production', nodeVersion });
    if (!result.ok) throw new Error(formatValidation(result));
  }
  const origin = env.NEXT_PUBLIC_API_URL || (development ? 'http://localhost:5002' : '');
  if (!validReleaseOrigin(origin, development ? 'test' : 'production')) throw new Error('NEXT_PUBLIC_API_URL must be a canonical backend origin');
  const paths = scope === 'dashboard' ? ['api', 'daas'] : ['api'];
  return paths.map(path => ({ source: `/${path}/:path*`, destination: `${origin}/${path}/:path*` }));
}
