// Shared runtime/release validation. Never include supplied credential values in errors.
export function firebaseCredentialMode(env) {
    const mode = env.FIREBASE_CREDENTIAL_MODE;
    if (mode === undefined || mode === '') return 'legacy';
    const invalid = (name, message) => {
        const error = new Error(`[Firebase] ${message}`);
        error.configurationName = name;
        throw error;
    };
    if (mode !== 'adc') invalid('FIREBASE_CREDENTIAL_MODE', 'Unknown FIREBASE_CREDENTIAL_MODE; omit it or use adc.');
    if (typeof env.FIREBASE_PROJECT_ID !== 'string'
        || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(env.FIREBASE_PROJECT_ID)
        || env.FIREBASE_PROJECT_ID !== 'inventaapi-staging') {
        invalid('FIREBASE_PROJECT_ID', 'Staging ADC requires FIREBASE_PROJECT_ID=inventaapi-staging.');
    }
    for (const name of ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) {
        if (env[name] !== undefined && env[name] !== '') invalid(name, `${name} must be omitted in staging ADC mode.`);
    }
    if (env.FIREBASE_AUTH_MODE !== undefined && env.FIREBASE_AUTH_MODE !== ''
        && env.FIREBASE_AUTH_MODE !== 'application_default') {
        invalid('FIREBASE_AUTH_MODE', 'Staging ADC requires FIREBASE_AUTH_MODE to be omitted or application_default.');
    }
    for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
        if (env[name] !== undefined && env[name] !== '' && env[name] !== env.FIREBASE_PROJECT_ID) {
            invalid(name, `${name} conflicts with the explicit staging project.`);
        }
    }
    return 'adc';
}

// SDK capabilities are injected for isolated tests; the caller supplies the real
// Admin SDK. Creating the default app remains synchronous before the first await,
// preserving service-module initialization order. No Firestore/Storage request
// is made here. Only ADC token availability is checked, with a bounded deadline.
export async function initializeStagingAdc({ env, getApps, applicationDefault, initializeApp, timeoutMs = 10000 }) {
    if (firebaseCredentialMode(env) !== 'adc') throw new Error('[Firebase] Explicit staging ADC mode is required.');
    let timer;
    try {
        const credential = applicationDefault();
        const apps = getApps();
        let app;
        if (apps.length) {
            app = apps[0];
            if (apps.length !== 1 || app.name !== '[DEFAULT]'
                || app.options.projectId !== env.FIREBASE_PROJECT_ID || app.options.credential !== credential) {
                throw new Error('Conflicting initialized Firebase application');
            }
        } else {
            app = initializeApp({ credential, projectId: env.FIREBASE_PROJECT_ID });
        }
        const token = await Promise.race([
            credential.getAccessToken(),
            new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('ADC timeout')), timeoutMs); }),
        ]);
        if (!token || typeof token.access_token !== 'string' || !token.access_token
            || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error('Unavailable ADC token');
        return app;
    } catch {
        // SDK/provider exceptions may include credential details. Do not chain/log them.
        throw new Error('[Firebase] Staging ADC initialization failed; verify attached identity and credential availability.');
    } finally {
        clearTimeout(timer);
    }
}
