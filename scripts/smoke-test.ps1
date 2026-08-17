# End-to-end smoke test for the Badem CRM API.
#
#   1. npm run seed          (fresh database with the demo supplier/source/client)
#   2. npm run start:dev
#   3. ./scripts/smoke-test.ps1
#
# Exercises authentication, roles and the whole source/product stock flow.
# Expects the seeded admin (admin@badem.local / Admin123!) to exist.

$ErrorActionPreference = 'Continue'
$base = 'http://localhost:3000/api'
$pass = 0; $fail = 0

function Req($method, $path, $body, $token) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $params = @{ Uri = "$base$path"; Method = $method; Headers = $headers; ContentType = 'application/json' }
  if ($body) { $params['Body'] = ($body | ConvertTo-Json -Depth 5) }
  try { return @{ ok = $true; status = 200; data = (Invoke-RestMethod @params) } }
  catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    return @{ ok = $false; status = $code; err = $_.ErrorDetails.Message }
  }
}

function Check($name, $cond, $detail) {
  if ($cond) { $script:pass++; Write-Host "  PASS  $name $detail" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL  $name $detail" -ForegroundColor Red }
}

Write-Host "`n--- 1. AUTH ---"
$r = Req POST '/auth/login' @{ email = 'admin@badem.local'; password = 'Admin123!' }
Check 'login returns token pair' ($r.ok -and $r.data.accessToken -and $r.data.refreshToken) "(expiresIn=$($r.data.expiresIn)s)"
$access = $r.data.accessToken; $refresh = $r.data.refreshToken

$r = Req POST '/auth/login' @{ email = 'admin@badem.local'; password = 'wrong-password' }
Check 'wrong password rejected' ($r.status -eq 401) "(status $($r.status))"

$r = Req GET '/sources' $null $null
Check 'no token -> 401' ($r.status -eq 401) "(status $($r.status))"

$r = Req GET '/auth/me' $null $access
Check 'me returns profile' ($r.ok -and $r.data.email -eq 'admin@badem.local') "(role=$($r.data.role))"
Check 'password hash not exposed' ($r.ok -and -not $r.data.passwordHash -and -not $r.data.refreshTokenHash) ''

Write-Host "`n--- 2. SEED DATA ---"
$source = (Req GET '/sources' $null $access).data.data[0]
$client = (Req GET '/clients' $null $access).data.data[0]
$supplier = (Req GET '/suppliers' $null $access).data.data[0]
Check 'source + client exist' ($source -and $client) "(source '$($source.name)' = $($source.quantity) $($source.unit), supplier '$($source.supplier.name)')"
$startQty = $source.quantity

Write-Host "`n--- 3. PRODUCT CREATION DECREASES SOURCE ---"
$r = Req POST '/products' @{ name = 'Roasted almond 500g'; sku = "ALM-$(Get-Random)"; quantity = 200; sourceUsage = 0.5; price = 65000; clientId = $client.id; sourceId = $source.id } $access
$product = $r.data
Check 'product created' ($r.ok) "(totalSourceUsed=$($product.totalSourceUsed))"
Check 'totalSourceUsed = qty * usage' ($product.totalSourceUsed -eq 100) "(200 x 0.5 = $($product.totalSourceUsed))"
$r = Req GET "/sources/$($source.id)" $null $access
Check 'source decreased by 100' ($r.data.quantity -eq ($startQty - 100)) "($startQty -> $($r.data.quantity))"
$h = (Req GET "/sources/$($source.id)/history" $null $access).data.data[0]
Check 'PRODUCTION history written' ($h.action -eq 'PRODUCTION' -and $h.quantityChange -eq -100) "(before=$($h.quantityBefore) change=$($h.quantityChange) after=$($h.quantityAfter))"
Check 'history links product + user' ($h.productId -eq $product.id -and $h.userId) ''

Write-Host "`n--- 4. OVERSELL IS REFUSED ---"
$r = Req POST '/products' @{ name = 'Impossible batch'; quantity = 100000; sourceUsage = 1; clientId = $client.id; sourceId = $source.id } $access
Check 'insufficient stock -> 409' ($r.status -eq 409) "(status $($r.status))"
$r = Req GET "/sources/$($source.id)" $null $access
Check 'stock unchanged after failure' ($r.data.quantity -eq ($startQty - 100)) "(still $($r.data.quantity))"

Write-Host "`n--- 5. UPDATE RE-SETTLES STOCK ---"
$r = Req PATCH "/products/$($product.id)" @{ quantity = 300 } $access
Check 'product updated to 300 units' ($r.ok -and $r.data.totalSourceUsed -eq 150) "(totalSourceUsed=$($r.data.totalSourceUsed))"
$r = Req GET "/sources/$($source.id)" $null $access
Check 'extra 50 taken from stock' ($r.data.quantity -eq ($startQty - 150)) "($($r.data.quantity))"

Write-Host "`n--- 6. DELETE RETURNS STOCK ---"
$r = Req DELETE "/products/$($product.id)" $null $access
Check 'product deleted' ($r.ok) ''
$r = Req GET "/sources/$($source.id)" $null $access
Check 'stock fully returned' ($r.data.quantity -eq $startQty) "(back to $($r.data.quantity))"
$r = Req GET "/sources/$($source.id)/history" $null $access
Check 'RETURN logged' ($r.data.data[0].action -eq 'RETURN') "(entries=$($r.data.meta.total))"

Write-Host "`n--- 7. RESTOCK / ADJUST ---"
$r = Req POST "/sources/$($source.id)/restock" @{ quantity = 250; note = 'Invoice #4471' } $access
Check 'restock adds stock' ($r.data.quantity -eq ($startQty + 250)) "($($r.data.quantity))"
$r = Req POST "/sources/$($source.id)/adjust" @{ quantity = 1000; note = 'Inventory count' } $access
Check 'adjust sets absolute value' ($r.data.quantity -eq 1000) "($($r.data.quantity))"
$r = Req GET "/source-history?sourceId=$($source.id)" $null $access
$actions = ($r.data.data | ForEach-Object { $_.action }) -join ','
Check 'full ledger readable' ($r.data.meta.total -ge 5) "(newest first: $actions)"

Write-Host "`n--- 8. SWITCHING A PRODUCT TO ANOTHER SOURCE ---"
$srcB = (Req POST '/sources' @{ name = "Almond flour $(Get-Random)"; unit = 'kg'; quantity = 500; minQuantity = 50; supplierId = $supplier.id } $access).data
Check 'second source created' ($srcB.quantity -eq 500) "(B = $($srcB.quantity) kg)"
Check 'opening stock logged' ((Req GET "/sources/$($srcB.id)/history" $null $access).data.data[0].action -eq 'RESTOCK') ''
$aBefore = (Req GET "/sources/$($source.id)" $null $access).data.quantity
$prod = (Req POST '/products' @{ name = 'Almond paste'; quantity = 10; sourceUsage = 2; clientId = $client.id; sourceId = $source.id } $access).data
Check 'product takes 20 from A' ((Req GET "/sources/$($source.id)" $null $access).data.quantity -eq ($aBefore - 20)) "(A: $aBefore -> $($aBefore - 20))"
$r = Req PATCH "/products/$($prod.id)" @{ sourceId = $srcB.id } $access
Check 'switch persisted on the product' ($r.ok -and $r.data.source.id -eq $srcB.id) "(now uses '$($r.data.source.name)')"
Check 'A got its 20 back' ((Req GET "/sources/$($source.id)" $null $access).data.quantity -eq $aBefore) "(A back to $aBefore)"
Check 'B paid the 20' ((Req GET "/sources/$($srcB.id)" $null $access).data.quantity -eq 480) "(B = 480)"
$hA = (Req GET "/sources/$($source.id)/history" $null $access).data.data[0]
$hB = (Req GET "/sources/$($srcB.id)/history" $null $access).data.data[0]
Check 'both ledgers updated' ($hA.action -eq 'RETURN' -and $hB.action -eq 'PRODUCTION') "(A=$($hA.action) $($hA.quantityChange), B=$($hB.action) $($hB.quantityChange))"

Write-Host "`n--- 9. REFERENTIAL GUARDS ---"
Check 'source in use cannot be deleted' ((Req DELETE "/sources/$($srcB.id)" $null $access).status -eq 409) ''
Check 'supplier with sources cannot be deleted' ((Req DELETE "/suppliers/$($supplier.id)" $null $access).status -eq 409) ''
Check 'client with products cannot be deleted' ((Req DELETE "/clients/$($client.id)" $null $access).status -eq 409) ''
$sku = "DUP-$(Get-Random)"
$r = Req POST '/products' @{ name = 'Sku holder'; sku = $sku; quantity = 1; sourceUsage = 1; clientId = $client.id; sourceId = $srcB.id } $access
Check 'product with sku created' ($r.ok) "(sku=$sku)"
$r = Req POST '/products' @{ name = 'Sku twin'; sku = $sku; quantity = 1; sourceUsage = 1; clientId = $client.id; sourceId = $srcB.id } $access
Check 'duplicate sku rejected' ($r.status -eq 409) "(status $($r.status))"
Check 'source needs a real supplier' ((Req POST '/sources' @{ name = 'Orphan'; supplierId = '00000000-0000-0000-0000-000000000000' } $access).status -eq 404) ''

Write-Host "`n--- 10. LOW STOCK FILTER ---"
$salt = (Req POST '/sources' @{ name = "Salt $(Get-Random)"; unit = 'kg'; quantity = 5; minQuantity = 20; supplierId = $supplier.id } $access).data
$r = Req GET '/sources?lowStock=true' $null $access
Check 'low stock source listed' ($r.data.data.id -contains $salt.id) "(matches=$($r.data.meta.total))"

Write-Host "`n--- 11. EMPLOYEES + USER LINK ---"
$email = "emp$(Get-Random)@badem.local"
$user = (Req POST '/users' @{ email = $email; fullName = 'Linked User'; password = 'Employee123!'; role = 'MANAGER' } $access).data
Check 'admin creates a MANAGER user' ($user.role -eq 'MANAGER') ''
$emp = (Req POST '/employees' @{ fullName = 'Dilshod Karimov'; position = 'Warehouse manager'; salary = 5000000; hiredAt = '2026-01-15'; userId = $user.id } $access).data
Check 'employee linked to user' ($emp.user.email -eq $email) "(salary=$($emp.salary))"
Check 'user cannot back two employees' ((Req POST '/employees' @{ fullName = 'Someone Else'; position = 'Packer'; userId = $user.id } $access).status -eq 409) ''
Check 'employee without login is fine' ((Req POST '/employees' @{ fullName = 'No Login'; position = 'Packer' } $access).ok) ''
$email2 = "emp$(Get-Random)@badem.local"
$user2 = (Req POST '/users' @{ email = $email2; fullName = 'Second User'; password = 'Employee123!' } $access).data
$r = Req PATCH "/employees/$($emp.id)" @{ userId = $user2.id; position = 'Head of warehouse' } $access
Check 're-link employee to another user' ($r.data.user.email -eq $email2) "(position=$($r.data.position))"
$r = Req PATCH "/employees/$($emp.id)" @{ salary = 6000000 } $access
Check 'partial update keeps the link' ($r.data.user.email -eq $email2 -and $r.data.salary -eq 6000000) ''

Write-Host "`n--- 12. MOVING A SOURCE TO ANOTHER SUPPLIER ---"
$sup2 = (Req POST '/suppliers' @{ name = "Nut Trade Co $(Get-Random)" } $access).data
$r = Req PATCH "/sources/$($salt.id)" @{ supplierId = $sup2.id; minQuantity = 30 } $access
Check 'source supplier changed' ($r.data.supplierId -eq $sup2.id) "(supplier=$($r.data.supplier.name), min=$($r.data.minQuantity))"
Check 'stock untouched by PATCH' ($r.data.quantity -eq 5) "(qty=$($r.data.quantity))"

Write-Host "`n--- 13. ROLES ---"
$r = Req POST '/auth/register' @{ email = "worker$(Get-Random)@badem.local"; fullName = 'Test Worker'; password = 'Worker123!' }
Check 'register returns tokens' ($r.ok -and $r.data.accessToken) ''
$empAccess = $r.data.accessToken
Check 'EMPLOYEE cannot create supplier' ((Req POST '/suppliers' @{ name = 'Sneaky supplier' } $empAccess).status -eq 403) ''
Check 'EMPLOYEE can produce' ((Req POST '/products' @{ name = 'Worker batch'; quantity = 10; sourceUsage = 1; clientId = $client.id; sourceId = $source.id } $empAccess).ok) ''

Write-Host "`n--- 14. REFRESH ROTATION ---"
$r = Req POST '/auth/refresh' $null $refresh
Check 'refresh returns new pair' ($r.ok -and $r.data.accessToken) ''
$newRefresh = $r.data.refreshToken
Check 'refresh token rotated' ($newRefresh -ne $refresh) ''
Check 'old refresh token rejected' ((Req POST '/auth/refresh' $null $refresh).status -eq 401) ''
Check 'reuse killed the session' ((Req POST '/auth/refresh' $null $newRefresh).status -eq 401) ''
$access = (Req POST '/auth/login' @{ email = 'admin@badem.local'; password = 'Admin123!' }).data.accessToken
Check 'access token rejected at /refresh' ((Req POST '/auth/refresh' $null $access).status -eq 401) ''

Write-Host "`n--- 15. PASSWORD CHANGE / LOGOUT / DEACTIVATION ---"
$r = Req POST '/auth/login' @{ email = $email; password = 'Employee123!' }
$userAccess = $r.data.accessToken; $userRefresh = $r.data.refreshToken
Check 'wrong current password -> 400' ((Req PATCH '/users/me/password' @{ currentPassword = 'wrong'; newPassword = 'Brand0New!' } $userAccess).status -eq 400) ''
Check 'password changed' ((Req PATCH '/users/me/password' @{ currentPassword = 'Employee123!'; newPassword = 'Brand0New!' } $userAccess).ok) ''
Check 'old password no longer works' ((Req POST '/auth/login' @{ email = $email; password = 'Employee123!' }).status -eq 401) ''
Check 'new password works' ((Req POST '/auth/login' @{ email = $email; password = 'Brand0New!' }).ok) ''
Check 'password change killed old session' ((Req POST '/auth/refresh' $null $userRefresh).status -eq 401) ''
$r = Req POST '/auth/login' @{ email = $email; password = 'Brand0New!' }
$a2 = $r.data.accessToken; $r2 = $r.data.refreshToken
Check 'logout accepted' ((Req POST '/auth/logout' $null $a2).ok) ''
Check 'refresh dead after logout' ((Req POST '/auth/refresh' $null $r2).status -eq 401) ''
Check 'user deactivated' ((Req PATCH "/users/$($user.id)" @{ isActive = $false } $access).ok) ''
Check 'disabled account cannot log in' ((Req POST '/auth/login' @{ email = $email; password = 'Brand0New!' }).status -eq 401) ''

Write-Host "`n--- 16. VALIDATION / PAGINATION ---"
Check 'unknown field -> 400' ((Req POST '/clients' @{ name = 'X'; nonsense = 'field' } $access).status -eq 400) ''
Check 'unknown client -> 404' ((Req POST '/products' @{ name = 'No client'; quantity = 5; clientId = '00000000-0000-0000-0000-000000000000'; sourceId = $source.id } $access).status -eq 404) ''
$r = Req GET '/sources?page=1&limit=2' $null $access
Check 'pagination meta correct' ($r.data.data.Count -le 2 -and $r.data.meta.limit -eq 2) "(total=$($r.data.meta.total) pages=$($r.data.meta.pageCount))"
Check 'limit over max -> 400' ((Req GET '/sources?limit=999' $null $access).status -eq 400) ''

Write-Host "`n================================"
Write-Host "PASSED: $pass   FAILED: $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
