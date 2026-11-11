# ARES-1 offline demo: tiny static web server built on Windows' own HttpListener (no installs needed).
param([string]$Root = (Join-Path $PSScriptRoot '..\site'), [int]$Port = 5173)
$Root = (Resolve-Path $Root).Path
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.css'='text/css'; '.json'='application/json';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.webp'='image/webp'; '.glb'='model/gltf-binary'; '.bin'='application/octet-stream'; '.txt'='text/plain'; '.mjs'='text/javascript'; '.wasm'='application/wasm'; '.task'='application/octet-stream' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "Port $Port is busy. Close the other window or edit START.bat to use another port."; Read-Host 'Press Enter to exit'; exit 1 }
Write-Host "ARES-1 demo running at http://localhost:$Port/  (keep this window open; close it to stop)"
Start-Process "http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext(); $res = $ctx.Response
  try {
    $p = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($p.EndsWith('/')) { $p += 'index.html' }
    $f = [IO.Path]::GetFullPath((Join-Path $Root $p.TrimStart('/')))
    if (-not $f.StartsWith($Root) -or -not (Test-Path -LiteralPath $f -PathType Leaf)) { $res.StatusCode = 404 }
    else {
      $ext = [IO.Path]::GetExtension($f).ToLower()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $fs = [IO.File]::OpenRead($f); $res.ContentLength64 = $fs.Length
      try { $fs.CopyTo($res.OutputStream) } finally { $fs.Close() }
    }
  } catch { } finally { try { $res.Close() } catch { } }
}
