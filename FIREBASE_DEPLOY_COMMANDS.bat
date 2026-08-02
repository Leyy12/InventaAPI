@echo off
REM Firebase Deployment Script for Firestore Rules and Indexes
REM Run this from the project root directory

echo ═══════════════════════════════════════════════════════
echo FIREBASE DEPLOYMENT - FIRESTORE RULES & INDEXES
echo ═══════════════════════════════════════════════════════
echo.

echo Step 1: Logging in to Firebase...
call firebase login
if %errorlevel% neq 0 (
    echo ❌ Firebase login failed
    pause
    exit /b 1
)
echo.

echo Step 2: Selecting project inventaapi-db...
call firebase use inventaapi-db
if %errorlevel% neq 0 (
    echo ❌ Project selection failed
    pause
    exit /b 1
)
echo.

echo Step 3: Deploying Firestore rules and indexes...
call firebase deploy --only firestore:rules,firestore:indexes
if %errorlevel% neq 0 (
    echo ❌ Deployment failed
    pause
    exit /b 1
)
echo.

echo ═══════════════════════════════════════════════════════
echo ✅ DEPLOYMENT COMPLETE!
echo ═══════════════════════════════════════════════════════
echo.
echo Next: Verify deployment in Firebase Console:
echo 1. Rules: https://console.firebase.google.com/project/inventaapi-db/firestore/rules
echo 2. Indexes: https://console.firebase.google.com/project/inventaapi-db/firestore/indexes
echo.
pause
