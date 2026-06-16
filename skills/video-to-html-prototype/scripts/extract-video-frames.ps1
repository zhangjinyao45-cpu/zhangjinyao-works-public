param(
  [Parameter(Mandatory = $true)][string]$VideoPath,
  [string]$OutputDir,
  [string[]]$Seconds = @("1"),
  [string]$Prefix = "frame",
  [switch]$InfoOnly
)

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

function Open-Player {
  param([string]$Path)

  $script:opened = $false
  $script:failed = $false
  $script:mediaError = $null

  $player = New-Object System.Windows.Media.MediaPlayer
  $player.add_MediaOpened({ $script:opened = $true })
  $player.add_MediaFailed({
    param($sender, $args)
    $script:failed = $true
    $script:mediaError = if ($args.ErrorException) { $args.ErrorException.Message } else { "unknown media error" }
  })

  $player.Open([Uri]$Path)

  for ($i = 0; $i -lt 300 -and -not $script:opened -and -not $script:failed; $i++) {
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke(
      [action]{},
      [System.Windows.Threading.DispatcherPriority]::Background
    )
    Start-Sleep -Milliseconds 100
  }

  if ($script:failed) {
    throw "Media open failed: $script:mediaError"
  }

  if (-not $script:opened) {
    throw "Media open timeout for $Path"
  }

  return $player
}

function Save-Frame {
  param(
    [string]$VideoPath,
    [double]$Second,
    [string]$TargetPath
  )

  $Player = Open-Player -Path $VideoPath

  $Player.Volume = 0
  $Player.Play()
  Start-Sleep -Milliseconds 450
  $Player.Position = [TimeSpan]::FromSeconds($Second)
  Start-Sleep -Milliseconds 1200
  $Player.Pause()
  Start-Sleep -Milliseconds 250

  $width = [int]$Player.NaturalVideoWidth
  $height = [int]$Player.NaturalVideoHeight

  if ($width -le 0 -or $height -le 0) {
    throw "Invalid video size: $width x $height"
  }

  $visual = New-Object System.Windows.Media.DrawingVisual
  $context = $visual.RenderOpen()
  $rect = New-Object System.Windows.Rect(0, 0, $width, $height)
  $context.DrawVideo($Player, $rect)
  $context.Close()

  $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(
    $width,
    $height,
    96,
    96,
    [System.Windows.Media.PixelFormats]::Pbgra32
  )
  $bitmap.Render($visual)

  $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))

  $stream = [System.IO.File]::Open($TargetPath, [System.IO.FileMode]::Create)
  try {
    $encoder.Save($stream)
  } finally {
    $stream.Dispose()
    $Player.Close()
  }
}

function Parse-Seconds {
  param([string[]]$RawValues)

  $parsed = @()
  foreach ($raw in $RawValues) {
    foreach ($piece in ($raw -split ",")) {
      $trimmed = $piece.Trim()
      if (-not $trimmed) {
        continue
      }
      $parsed += [double]::Parse($trimmed, [System.Globalization.CultureInfo]::InvariantCulture)
    }
  }
  return $parsed
}

$player = Open-Player -Path $VideoPath
$secondValues = Parse-Seconds -RawValues $Seconds

try {
  $info = [pscustomobject]@{
    VideoPath = $VideoPath
    DurationSeconds = [math]::Round($player.NaturalDuration.TimeSpan.TotalSeconds, 2)
    Width = [int]$player.NaturalVideoWidth
    Height = [int]$player.NaturalVideoHeight
  }

  if ($InfoOnly) {
    $info | ConvertTo-Json -Compress
    return
  }

  if (-not $OutputDir) {
    throw "OutputDir is required unless -InfoOnly is used."
  }

  if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
  }

  $results = @()
  foreach ($second in $secondValues) {
    $label = "{0:00.00}" -f $second
    $filename = "{0}-{1}s.png" -f $Prefix, $label.Replace(".", "_")
    $target = Join-Path $OutputDir $filename
    Save-Frame -VideoPath $VideoPath -Second $second -TargetPath $target
    $results += [pscustomobject]@{
      Second = $second
      OutputPath = $target
    }
  }

  $results | ConvertTo-Json -Compress
} finally {
  $player.Close()
}
