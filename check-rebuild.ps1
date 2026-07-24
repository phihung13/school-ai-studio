# In ra '1' neu CAN build lai (chua build lan nao, hoac co file nguon moi hon ban build gan nhat), nguoc lai '0'.
# Dung boi start-app-tunnel.cmd.
$b = Get-Item '.next/BUILD_ID' -ErrorAction SilentlyContinue
if (-not $b) { '1'; exit }
$paths = @('src', 'public', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json')
$files = Get-ChildItem -Path $paths -Recurse -File -ErrorAction SilentlyContinue
$newer = $false
foreach ($x in $files) { if ($x.LastWriteTime -gt $b.LastWriteTime) { $newer = $true; break } }
if ($newer) { '1' } else { '0' }
