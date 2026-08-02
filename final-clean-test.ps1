# Create a brand new test key
Write-Host "Creating brand new test key..."
$keyString = node -e "import('firebase-admin/app').then(({initializeApp,cert})=>{const {readFileSync}=require('fs');initializeApp({credential:cert(JSON.parse(readFileSync('./service-account.json','utf8')))});return import('firebase-admin/firestore')}).then(async({getFirestore})=>{const db=getFirestore();const userId='clean_final_'+Date.now();await db.collection('users').doc(userId).set({uid:userId,fullName:'Clean Final Test',email:'cleanfinal@test.local',plan:'Starter',apiRequestLimit:50,createdAt:new Date().toISOString()});const keyString='daas_cleanfinal_'+Date.now().toString(36)+'_'+Math.random().toString(36).substring(2,10);await db.collection('api_keys').add({key:keyString,name:'Clean Final Key',userId:userId,userEmail:'cleanfinal@test.local',plan:'Starter',status:'active',linkedProducts:[],linkedProductIds:[]});console.log(keyString)})"

Write-Host "Test Key: $keyString`n"

# Verify initial state
Write-Host "Verifying initial Firestore state..."
node -e "import('firebase-admin/app').then(({initializeApp,cert})=>{const {readFileSync}=require('fs');initializeApp({credential:cert(JSON.parse(readFileSync('./service-account.json','utf8')))});return import('firebase-admin/firestore')}).then(async({getFirestore})=>{const db=getFirestore();const snap=await db.collection('api_keys').where('key','==','$keyString').limit(1).get();if(!snap.empty){const data=snap.docs[0].data();console.log('requestsUsed:',data.requestsUsed||'undefined');console.log('resetAt:',data.resetAt||'undefined')}})"

Write-Host "`nMaking 51 requests..."
Write-Host "Expected: Requests 1-50 return 200, Request 51 returns 429`n"

$count200 = 0
$count429 = 0
$first429 = 0

for ($i=1; $i -le 51; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/daas/v1/catalog" -Headers @{"x-api-key"="$keyString"} -UseBasicParsing -ErrorAction Stop
        $count200++
        if ($i -le 5 -or $i -ge 48) {
            Write-Host "Request $i : 200 OK"
        } elseif ($i -eq 6) {
            Write-Host "... (requests 6-47 all 200 OK) ..."
        }
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 429) {
            $count429++
            if ($first429 -eq 0) { $first429 = $i }
            Write-Host "Request $i : 429 RATE LIMIT EXCEEDED"
        }
    }
}

Write-Host "`n========== RESULTS =========="
Write-Host "Total 200 responses: $count200"
Write-Host "Total 429 responses: $count429"
Write-Host "First 429 at request: $first429"
Write-Host "Expected first 429: 51"
Write-Host "Status: $(if ($count200 -eq 50 -and $count429 -eq 1 -and $first429 -eq 51) {'✅ PASS'} else {'❌ FAIL'})"

Write-Host "`nFinal Firestore state:"
node -e "import('firebase-admin/app').then(({initializeApp,cert})=>{const {readFileSync}=require('fs');initializeApp({credential:cert(JSON.parse(readFileSync('./service-account.json','utf8')))});return import('firebase-admin/firestore')}).then(async({getFirestore})=>{const db=getFirestore();const snap=await db.collection('api_keys').where('key','==','$keyString').limit(1).get();if(!snap.empty){const data=snap.docs[0].data();console.log('requestsUsed:',data.requestsUsed);console.log('Expected: 50 (or 51 if 429 also increments)')}})"
