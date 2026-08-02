# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\production-15min-observation.spec.js >> Production Mode - 15 Minute AuthProvider Stability Test >> should NOT remount AuthProvider during 15-minute observation
- Location: tests\production-15min-observation.spec.js:5:3

# Error details

```
Error: page.waitForTimeout: Page crashed
```

# Test source

```ts
  15  |       
  16  |       // Track "Auth listener started"
  17  |       if (text.includes('Auth listener started') || text.includes('🔄 Auth listener started') || text.includes('listener-init')) {
  18  |         listenerStartEvents.push({ timestamp, text });
  19  |         console.log(`[${timestamp}] ⚠️  LISTENER START DETECTED:`, text);
  20  |       }
  21  |       
  22  |       // Track "NULL (no user data)" or appUser: null
  23  |       if (text.includes('NULL (no user data)') || text.includes('❌ NULL') || 
  24  |           (text.includes('appUser-changed') && text.includes('"exists":false'))) {
  25  |         nullUserDataEvents.push({ timestamp, text });
  26  |         console.log(`[${timestamp}] ⚠️  NULL USER DETECTED:`, text);
  27  |       }
  28  |       
  29  |       // Track all auth-related logs for reference
  30  |       if (text.includes('FLICKER DEBUG') || text.includes('AUTH DEBUG') || 
  31  |           text.includes('listener-init') || text.includes('auth-fired') ||
  32  |           text.includes('appUser-changed')) {
  33  |         observations.push({ timestamp, text });
  34  |       }
  35  |     });
  36  | 
  37  |     console.log('\n========================================');
  38  |     console.log('🧪 PRODUCTION MODE: 15-MINUTE OBSERVATION TEST');
  39  |     console.log('========================================\n');
  40  |     console.log('Starting test at:', new Date().toISOString());
  41  |     console.log('Test duration: 900 seconds (15 minutes)');
  42  |     console.log('Check interval: 15 seconds');
  43  |     console.log('Mode: PRODUCTION (npm run start)\n');
  44  | 
  45  |     // Step 1: Navigate directly to dashboard (will redirect to login if not authenticated)
  46  |     console.log('[00:00] Navigating to dashboard...');
  47  |     await page.goto('http://localhost:3000/dashboard');
  48  |     
  49  |     // Step 2: Check if already authenticated or if login page appears
  50  |     console.log('[00:00] Checking auth status...');
  51  |     
  52  |     try {
  53  |       // If already on dashboard (authenticated), great!
  54  |       await page.waitForSelector('aside', { timeout: 5000 });
  55  |       console.log('[00:00] ✅ Already authenticated\n');
  56  |     } catch {
  57  |       // Not authenticated, need to login
  58  |       console.log('[00:00] Not authenticated, attempting login...');
  59  |       
  60  |       // Clear storage first
  61  |       await page.evaluate(() => localStorage.clear());
  62  |       
  63  |       // Try to find and fill login form
  64  |       try {
  65  |         // Look for email input field (might be in a modal or on page)
  66  |         await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  67  |         await page.fill('input[type="email"]', 'developer@test.com');
  68  |         await page.fill('input[type="password"]', 'password123');
  69  |         
  70  |         // Find and click submit button
  71  |         await page.click('button[type="submit"]');
  72  |         
  73  |         // Wait for redirect to dashboard
  74  |         await page.waitForURL('**/dashboard', { timeout: 10000 });
  75  |         console.log('[00:00] ✅ Logged in successfully\n');
  76  |       } catch (loginError) {
  77  |         console.log('[00:00] ❌ Login failed:', loginError.message);
  78  |         console.log('[00:00] 🟡 SKIPPING TEST - Cannot authenticate automatically');
  79  |         console.log('[00:00] 📝 NOTE: Test requires manual authentication or pre-existing session\n');
  80  |         test.skip();
  81  |         return;
  82  |       }
  83  |     }
  84  | 
  85  |     // Initial wait for page to stabilize
  86  |     await page.waitForTimeout(3000);
  87  |     
  88  |     // Capture initial sidebar state
  89  |     try {
  90  |       const initialSidebar = await page.locator('aside').textContent();
  91  |       const initialHasDeveloper = initialSidebar.includes('Developer') && !initialSidebar.includes('Developer Plan');
  92  |       sidebarStates.push({
  93  |         timestamp: new Date().toISOString(),
  94  |         elapsed: '00:00',
  95  |         hasFallback: initialHasDeveloper,
  96  |         text: initialSidebar.substring(0, 200)
  97  |       });
  98  |       
  99  |       console.log('[00:00] Initial sidebar check:');
  100 |       console.log('  Has "Developer" fallback:', initialHasDeveloper);
  101 |       console.log('  Sidebar preview:', initialSidebar.substring(0, 100).replace(/\n/g, ' ').trim());
  102 |       console.log();
  103 |     } catch (e) {
  104 |       console.log('[00:00] ⚠️  Could not read sidebar, continuing anyway...\n');
  105 |     }
  106 | 
  107 |     // Step 3: Observe for 15 minutes, checking every 15 seconds
  108 |     const totalDuration = 900000; // 15 minutes in ms
  109 |     const checkInterval = 15000;  // 15 seconds
  110 |     const totalChecks = Math.floor(totalDuration / checkInterval);
  111 |     
  112 |     console.log(`[00:00] Starting observation: ${totalChecks} checks over 15 minutes...\n`);
  113 | 
  114 |     for (let i = 1; i <= totalChecks; i++) {
> 115 |       await page.waitForTimeout(checkInterval);
      |                  ^ Error: page.waitForTimeout: Page crashed
  116 |       
  117 |       const elapsedSeconds = i * (checkInterval / 1000);
  118 |       const minutes = Math.floor(elapsedSeconds / 60);
  119 |       const seconds = elapsedSeconds % 60;
  120 |       const elapsedFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  121 |       
  122 |       // Check sidebar state
  123 |       try {
  124 |         const sidebarText = await page.locator('aside').textContent();
  125 |         const hasDeveloperFallback = sidebarText.includes('Developer') && !sidebarText.includes('Developer Plan');
  126 |         
  127 |         sidebarStates.push({
  128 |           timestamp: new Date().toISOString(),
  129 |           elapsed: elapsedFormatted,
  130 |           hasFallback: hasDeveloperFallback,
  131 |           text: sidebarText.substring(0, 200)
  132 |         });
  133 | 
  134 |         // Log periodic status
  135 |         if (i % 4 === 0) { // Every minute
  136 |           console.log(`[${elapsedFormatted}] Check ${i}/${totalChecks} - Sidebar fallback: ${hasDeveloperFallback ? '❌ YES (BUG!)' : '✅ NO'}`);
  137 |         }
  138 |         
  139 |         // Immediate alert if fallback detected
  140 |         if (hasDeveloperFallback) {
  141 |           console.log(`\n⚠️  [${elapsedFormatted}] FALLBACK DETECTED! Sidebar shows "Developer"\n`);
  142 |         }
  143 |       } catch (e) {
  144 |         console.log(`[${elapsedFormatted}] ⚠️  Could not read sidebar at this check`);
  145 |       }
  146 |     }
  147 | 
  148 |     console.log('\n========================================');
  149 |     console.log('📊 TEST COMPLETE - FINAL RESULTS');
  150 |     console.log('========================================\n');
  151 | 
  152 |     // Report results
  153 |     console.log('1. AUTH LISTENER START COUNT:');
  154 |     console.log(`   Total fires: ${listenerStartEvents.length}`);
  155 |     if (listenerStartEvents.length > 1) {
  156 |       console.log('   ❌ BUG PERSISTS - Listener restarted multiple times:');
  157 |       listenerStartEvents.forEach((event, idx) => {
  158 |         console.log(`      ${idx + 1}. [${event.timestamp}]`);
  159 |       });
  160 |     } else if (listenerStartEvents.length === 1) {
  161 |       console.log('   ✅ EXPECTED - Listener started once at:', listenerStartEvents[0].timestamp);
  162 |     } else {
  163 |       console.log('   ⚠️  WARNING - No listener start detected (check console capture)');
  164 |     }
  165 |     console.log();
  166 | 
  167 |     console.log('2. NULL USER DATA EVENTS:');
  168 |     console.log(`   Total occurrences: ${nullUserDataEvents.length}`);
  169 |     if (nullUserDataEvents.length > 0) {
  170 |       console.log('   ❌ NULL events detected:');
  171 |       nullUserDataEvents.forEach((event, idx) => {
  172 |         console.log(`      ${idx + 1}. [${event.timestamp}]`);
  173 |       });
  174 |     } else {
  175 |       console.log('   ✅ No NULL events detected');
  176 |     }
  177 |     console.log();
  178 | 
  179 |     console.log('3. SIDEBAR VISUAL STATE:');
  180 |     const fallbackDetections = sidebarStates.filter(s => s.hasFallback);
  181 |     console.log(`   Fallback detections: ${fallbackDetections.length}/${sidebarStates.length} checks`);
  182 |     if (fallbackDetections.length > 0) {
  183 |       console.log('   ❌ Sidebar showed "Developer" fallback at:');
  184 |       fallbackDetections.forEach((state, idx) => {
  185 |         console.log(`      ${idx + 1}. [${state.elapsed}] ${state.timestamp}`);
  186 |       });
  187 |     } else {
  188 |       console.log('   ✅ Sidebar consistently showed correct data');
  189 |     }
  190 |     console.log();
  191 | 
  192 |     console.log('4. OVERALL VERDICT:');
  193 |     const bugPersists = listenerStartEvents.length > 1 || 
  194 |                        nullUserDataEvents.length > 2 || // Allow initial load nulls
  195 |                        fallbackDetections.length > 0;
  196 |     
  197 |     if (bugPersists) {
  198 |       console.log('   ❌ BUG STILL EXISTS IN PRODUCTION MODE');
  199 |       console.log('   Root cause: AuthProvider is still remounting unexpectedly');
  200 |     } else {
  201 |       console.log('   ✅ FIX SUCCESSFUL - NO REMOUNTING DETECTED');
  202 |       console.log('   Dev-mode HMR was indeed the cause');
  203 |     }
  204 |     console.log();
  205 | 
  206 |     console.log('========================================\n');
  207 | 
  208 |     // Assertions
  209 |     expect(listenerStartEvents.length).toBeLessThanOrEqual(1);
  210 |     expect(fallbackDetections.length).toBe(0);
  211 |   });
  212 | });
  213 | 
```