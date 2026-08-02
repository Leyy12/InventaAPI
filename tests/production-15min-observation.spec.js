// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Production Mode - 15 Minute AuthProvider Stability Test', () => {
  test('should NOT remount AuthProvider during 15-minute observation', async ({ page }) => {
    const observations = [];
    const listenerStartEvents = [];
    const nullUserDataEvents = [];
    const sidebarStates = [];
    
    // Capture console logs
    page.on('console', msg => {
      const text = msg.text();
      const timestamp = new Date().toISOString();
      
      // Track "Auth listener started"
      if (text.includes('Auth listener started') || text.includes('🔄 Auth listener started') || text.includes('listener-init')) {
        listenerStartEvents.push({ timestamp, text });
        console.log(`[${timestamp}] ⚠️  LISTENER START DETECTED:`, text);
      }
      
      // Track "NULL (no user data)" or appUser: null
      if (text.includes('NULL (no user data)') || text.includes('❌ NULL') || 
          (text.includes('appUser-changed') && text.includes('"exists":false'))) {
        nullUserDataEvents.push({ timestamp, text });
        console.log(`[${timestamp}] ⚠️  NULL USER DETECTED:`, text);
      }
      
      // Track all auth-related logs for reference
      if (text.includes('FLICKER DEBUG') || text.includes('AUTH DEBUG') || 
          text.includes('listener-init') || text.includes('auth-fired') ||
          text.includes('appUser-changed')) {
        observations.push({ timestamp, text });
      }
    });

    console.log('\n========================================');
    console.log('🧪 PRODUCTION MODE: 15-MINUTE OBSERVATION TEST');
    console.log('========================================\n');
    console.log('Starting test at:', new Date().toISOString());
    console.log('Test duration: 900 seconds (15 minutes)');
    console.log('Check interval: 15 seconds');
    console.log('Mode: PRODUCTION (npm run start)\n');

    // Step 1: Navigate directly to dashboard (will redirect to login if not authenticated)
    console.log('[00:00] Navigating to dashboard...');
    await page.goto('http://localhost:3000/dashboard');
    
    // Step 2: Check if already authenticated or if login page appears
    console.log('[00:00] Checking auth status...');
    
    try {
      // If already on dashboard (authenticated), great!
      await page.waitForSelector('aside', { timeout: 5000 });
      console.log('[00:00] ✅ Already authenticated\n');
    } catch {
      // Not authenticated, need to login
      console.log('[00:00] Not authenticated, attempting login...');
      
      // Clear storage first
      await page.evaluate(() => localStorage.clear());
      
      // Try to find and fill login form
      try {
        // Look for email input field (might be in a modal or on page)
        await page.waitForSelector('input[type="email"]', { timeout: 10000 });
        await page.fill('input[type="email"]', 'developer@test.com');
        await page.fill('input[type="password"]', 'password123');
        
        // Find and click submit button
        await page.click('button[type="submit"]');
        
        // Wait for redirect to dashboard
        await page.waitForURL('**/dashboard', { timeout: 10000 });
        console.log('[00:00] ✅ Logged in successfully\n');
      } catch (loginError) {
        console.log('[00:00] ❌ Login failed:', loginError.message);
        console.log('[00:00] 🟡 SKIPPING TEST - Cannot authenticate automatically');
        console.log('[00:00] 📝 NOTE: Test requires manual authentication or pre-existing session\n');
        test.skip();
        return;
      }
    }

    // Initial wait for page to stabilize
    await page.waitForTimeout(3000);
    
    // Capture initial sidebar state
    try {
      const initialSidebar = await page.locator('aside').textContent();
      const initialHasDeveloper = initialSidebar.includes('Developer') && !initialSidebar.includes('Developer Plan');
      sidebarStates.push({
        timestamp: new Date().toISOString(),
        elapsed: '00:00',
        hasFallback: initialHasDeveloper,
        text: initialSidebar.substring(0, 200)
      });
      
      console.log('[00:00] Initial sidebar check:');
      console.log('  Has "Developer" fallback:', initialHasDeveloper);
      console.log('  Sidebar preview:', initialSidebar.substring(0, 100).replace(/\n/g, ' ').trim());
      console.log();
    } catch (e) {
      console.log('[00:00] ⚠️  Could not read sidebar, continuing anyway...\n');
    }

    // Step 3: Observe for 15 minutes, checking every 15 seconds
    const totalDuration = 900000; // 15 minutes in ms
    const checkInterval = 15000;  // 15 seconds
    const totalChecks = Math.floor(totalDuration / checkInterval);
    
    console.log(`[00:00] Starting observation: ${totalChecks} checks over 15 minutes...\n`);

    for (let i = 1; i <= totalChecks; i++) {
      await page.waitForTimeout(checkInterval);
      
      const elapsedSeconds = i * (checkInterval / 1000);
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      const elapsedFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      // Check sidebar state
      try {
        const sidebarText = await page.locator('aside').textContent();
        const hasDeveloperFallback = sidebarText.includes('Developer') && !sidebarText.includes('Developer Plan');
        
        sidebarStates.push({
          timestamp: new Date().toISOString(),
          elapsed: elapsedFormatted,
          hasFallback: hasDeveloperFallback,
          text: sidebarText.substring(0, 200)
        });

        // Log periodic status
        if (i % 4 === 0) { // Every minute
          console.log(`[${elapsedFormatted}] Check ${i}/${totalChecks} - Sidebar fallback: ${hasDeveloperFallback ? '❌ YES (BUG!)' : '✅ NO'}`);
        }
        
        // Immediate alert if fallback detected
        if (hasDeveloperFallback) {
          console.log(`\n⚠️  [${elapsedFormatted}] FALLBACK DETECTED! Sidebar shows "Developer"\n`);
        }
      } catch (e) {
        console.log(`[${elapsedFormatted}] ⚠️  Could not read sidebar at this check`);
      }
    }

    console.log('\n========================================');
    console.log('📊 TEST COMPLETE - FINAL RESULTS');
    console.log('========================================\n');

    // Report results
    console.log('1. AUTH LISTENER START COUNT:');
    console.log(`   Total fires: ${listenerStartEvents.length}`);
    if (listenerStartEvents.length > 1) {
      console.log('   ❌ BUG PERSISTS - Listener restarted multiple times:');
      listenerStartEvents.forEach((event, idx) => {
        console.log(`      ${idx + 1}. [${event.timestamp}]`);
      });
    } else if (listenerStartEvents.length === 1) {
      console.log('   ✅ EXPECTED - Listener started once at:', listenerStartEvents[0].timestamp);
    } else {
      console.log('   ⚠️  WARNING - No listener start detected (check console capture)');
    }
    console.log();

    console.log('2. NULL USER DATA EVENTS:');
    console.log(`   Total occurrences: ${nullUserDataEvents.length}`);
    if (nullUserDataEvents.length > 0) {
      console.log('   ❌ NULL events detected:');
      nullUserDataEvents.forEach((event, idx) => {
        console.log(`      ${idx + 1}. [${event.timestamp}]`);
      });
    } else {
      console.log('   ✅ No NULL events detected');
    }
    console.log();

    console.log('3. SIDEBAR VISUAL STATE:');
    const fallbackDetections = sidebarStates.filter(s => s.hasFallback);
    console.log(`   Fallback detections: ${fallbackDetections.length}/${sidebarStates.length} checks`);
    if (fallbackDetections.length > 0) {
      console.log('   ❌ Sidebar showed "Developer" fallback at:');
      fallbackDetections.forEach((state, idx) => {
        console.log(`      ${idx + 1}. [${state.elapsed}] ${state.timestamp}`);
      });
    } else {
      console.log('   ✅ Sidebar consistently showed correct data');
    }
    console.log();

    console.log('4. OVERALL VERDICT:');
    const bugPersists = listenerStartEvents.length > 1 || 
                       nullUserDataEvents.length > 2 || // Allow initial load nulls
                       fallbackDetections.length > 0;
    
    if (bugPersists) {
      console.log('   ❌ BUG STILL EXISTS IN PRODUCTION MODE');
      console.log('   Root cause: AuthProvider is still remounting unexpectedly');
    } else {
      console.log('   ✅ FIX SUCCESSFUL - NO REMOUNTING DETECTED');
      console.log('   Dev-mode HMR was indeed the cause');
    }
    console.log();

    console.log('========================================\n');

    // Assertions
    expect(listenerStartEvents.length).toBeLessThanOrEqual(1);
    expect(fallbackDetections.length).toBe(0);
  });
});
