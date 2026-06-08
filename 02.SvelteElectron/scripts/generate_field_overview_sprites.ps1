$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root 'resource/sprites/field-overview'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$scale = 4
$baseWidth = 24
$baseHeight = 32

$palette = @{
  Outline = [System.Drawing.ColorTranslator]::FromHtml('#0A0A0F')
  Blue = [System.Drawing.ColorTranslator]::FromHtml('#2D62C7')
  BlueDark = [System.Drawing.ColorTranslator]::FromHtml('#173A7A')
  BlueLight = [System.Drawing.ColorTranslator]::FromHtml('#6D98E9')
  Red = [System.Drawing.ColorTranslator]::FromHtml('#C43131')
  RedDark = [System.Drawing.ColorTranslator]::FromHtml('#7D191A')
  RedLight = [System.Drawing.ColorTranslator]::FromHtml('#EC6262')
  Black = [System.Drawing.ColorTranslator]::FromHtml('#20222A')
  BlackLight = [System.Drawing.ColorTranslator]::FromHtml('#575C69')
  White = [System.Drawing.ColorTranslator]::FromHtml('#F3F2EE')
  Gray = [System.Drawing.ColorTranslator]::FromHtml('#AAB3BE')
  GrayDark = [System.Drawing.ColorTranslator]::FromHtml('#767F8C')
  Skin = [System.Drawing.ColorTranslator]::FromHtml('#F3C4A0')
  SkinDark = [System.Drawing.ColorTranslator]::FromHtml('#D79372')
  Brown = [System.Drawing.ColorTranslator]::FromHtml('#8B5E3C')
  BrownDark = [System.Drawing.ColorTranslator]::FromHtml('#5E3B23')
  BrownLight = [System.Drawing.ColorTranslator]::FromHtml('#B88154')
  Wood = [System.Drawing.ColorTranslator]::FromHtml('#C99049')
  WoodDark = [System.Drawing.ColorTranslator]::FromHtml('#8E5B29')
  WoodLight = [System.Drawing.ColorTranslator]::FromHtml('#E2B16B')
  Hair = [System.Drawing.ColorTranslator]::FromHtml('#1A1618')
}

function New-Brush([System.Drawing.Color]$color) {
  return [System.Drawing.SolidBrush]::new($color)
}

function New-Pen([System.Drawing.Color]$color, [float]$widthUnits = 1) {
  $pen = [System.Drawing.Pen]::new($color, $widthUnits * $script:scale)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $pen
}

function New-Canvas {
  $bmp = [System.Drawing.Bitmap]::new($script:baseWidth * $script:scale, $script:baseHeight * $script:scale, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-ScaledBitmap([System.Drawing.Bitmap]$source, [string]$path) {
  $bmp = [System.Drawing.Bitmap]::new($script:baseWidth, $script:baseHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.DrawImage($source, 0, 0, $script:baseWidth, $script:baseHeight)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Draw-Ellipse([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [System.Drawing.Color]$fill, [float]$outlineUnits = 1) {
  $rect = [System.Drawing.RectangleF]::new($x * $script:scale, $y * $script:scale, $w * $script:scale, $h * $script:scale)
  $brush = New-Brush $fill
  $pen = New-Pen $script:palette.Outline $outlineUnits
  $g.FillEllipse($brush, $rect)
  $g.DrawEllipse($pen, $rect)
  $brush.Dispose()
  $pen.Dispose()
}

function Draw-Rect([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [System.Drawing.Color]$fill, [float]$outlineUnits = 1) {
  $rect = [System.Drawing.RectangleF]::new($x * $script:scale, $y * $script:scale, $w * $script:scale, $h * $script:scale)
  $brush = New-Brush $fill
  $pen = New-Pen $script:palette.Outline $outlineUnits
  $g.FillRectangle($brush, $rect)
  $g.DrawRectangle($pen, $rect.X, $rect.Y, $rect.Width, $rect.Height)
  $brush.Dispose()
  $pen.Dispose()
}

function Draw-Polygon([System.Drawing.Graphics]$g, [object[]]$points, [System.Drawing.Color]$fill, [float]$outlineUnits = 1) {
  $scaled = @()
  foreach ($point in $points) {
    $scaled += [System.Drawing.PointF]::new($point[0] * $script:scale, $point[1] * $script:scale)
  }
  $brush = New-Brush $fill
  $pen = New-Pen $script:palette.Outline $outlineUnits
  $g.FillPolygon($brush, $scaled)
  $g.DrawPolygon($pen, $scaled)
  $brush.Dispose()
  $pen.Dispose()
}

function Draw-Line([System.Drawing.Graphics]$g, [float]$x1, [float]$y1, [float]$x2, [float]$y2, [System.Drawing.Color]$fill, [float]$widthUnits = 2) {
  $outlinePen = New-Pen $script:palette.Outline ($widthUnits + 1)
  $innerPen = New-Pen $fill $widthUnits
  $g.DrawLine($outlinePen, $x1 * $script:scale, $y1 * $script:scale, $x2 * $script:scale, $y2 * $script:scale)
  $g.DrawLine($innerPen, $x1 * $script:scale, $y1 * $script:scale, $x2 * $script:scale, $y2 * $script:scale)
  $outlinePen.Dispose()
  $innerPen.Dispose()
}

function Fill-Line([System.Drawing.Graphics]$g, [float]$x1, [float]$y1, [float]$x2, [float]$y2, [System.Drawing.Color]$fill, [float]$widthUnits = 2) {
  $pen = New-Pen $fill $widthUnits
  $g.DrawLine($pen, $x1 * $script:scale, $y1 * $script:scale, $x2 * $script:scale, $y2 * $script:scale)
  $pen.Dispose()
}

function Draw-Glove([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$angle = 0) {
  $state = $g.Save()
  $g.TranslateTransform($x * $script:scale, $y * $script:scale)
  if ($angle -ne 0) { $g.RotateTransform($angle) }
  Draw-Ellipse $g (-$w / 2) (-$h / 2) $w $h $script:palette.Brown
  Draw-Ellipse $g (-$w / 2 + 0.9) (-$h / 2 + 0.9) ($w - 1.8) ($h - 1.8) $script:palette.BrownDark 0.4
  Fill-Line $g (-$w / 2 + 1.2) (-$h / 2 + 1.2) ($w / 2 - 1.2) ($h / 2 - 1.2) $script:palette.BrownLight 0.4
  Fill-Line $g (-$w / 2 + 1.2) ($h / 2 - 1.5) ($w / 2 - 1.2) (-$h / 2 + 1.5) $script:palette.BrownLight 0.4
  $g.Restore($state)
}

function Draw-Bat([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$len = 10, [float]$angle = -25) {
  $state = $g.Save()
  $g.TranslateTransform($x * $script:scale, $y * $script:scale)
  $g.RotateTransform($angle)
  Draw-Rect $g (-0.9) (-$len) 1.8 $len $script:palette.Wood 0.8
  Draw-Ellipse $g (-1.4) (-$len - 1.8) 2.8 2.8 $script:palette.WoodLight 0.8
  Fill-Line $g 0 (-$len + 1) 0 (-1.2) $script:palette.WoodDark 0.5
  $g.Restore($state)
}

function Draw-FrontHelmet([System.Drawing.Graphics]$g, [System.Drawing.Color]$main, [System.Drawing.Color]$shade, [float]$y = 1, [switch]$CapOnly) {
  Draw-Ellipse $g 4 $y 16 10 $main
  Draw-Ellipse $g 5 ($y + 1) 12 4.5 $script:palette.BlueLight 0.2
  if (-not $CapOnly) {
    Draw-Ellipse $g 3.4 ($y + 5.4) 2.5 4.4 $shade 0.8
    Draw-Ellipse $g 18.1 ($y + 5.4) 2.5 4.4 $shade 0.8
  }
  Draw-Rect $g 6.1 ($y + 7.1) 11.8 1.4 $script:palette.White 0.3
  Draw-Polygon $g @(@(5.4, $y + 8), @(18.7, $y + 8), @(17.1, $y + 10.7), @(6.8, $y + 10.7)) $shade 0.8
}

function Draw-BackHelmet([System.Drawing.Graphics]$g, [System.Drawing.Color]$main, [System.Drawing.Color]$shade, [float]$y = 1, [switch]$CapOnly) {
  Draw-Ellipse $g 4 $y 16 11 $main
  Draw-Ellipse $g 5 ($y + 1) 10 4.5 ([System.Drawing.Color]::FromArgb(110, $script:palette.White)) 0.2
  if (-not $CapOnly) {
    Draw-Ellipse $g 3.6 ($y + 6) 2.4 4.2 $shade 0.8
    Draw-Ellipse $g 18.0 ($y + 6) 2.4 4.2 $shade 0.8
  }
  Draw-Rect $g 6.6 ($y + 9.5) 10.8 1.2 $shade 0.2
}

function Draw-FrontFace([System.Drawing.Graphics]$g, [switch]$Serious) {
  Draw-Ellipse $g 6.2 8.2 11.6 6.8 $script:palette.Skin
  Draw-Ellipse $g 6.6 9.2 3.1 3.6 $script:palette.Black 0.5
  Draw-Ellipse $g 14.3 9.2 3.1 3.6 $script:palette.Black 0.5
  Draw-Ellipse $g 7.4 9.8 0.8 1.1 $script:palette.White 0.1
  Draw-Ellipse $g 15.0 9.8 0.8 1.1 $script:palette.White 0.1
  if ($Serious) {
    Fill-Line $g 10.2 13.1 13.8 13.1 $script:palette.Outline 0.3
  } else {
    Fill-Line $g 10.2 13.3 13.8 13.3 $script:palette.BrownDark 0.25
  }
}

function Draw-BackHairBand([System.Drawing.Graphics]$g) {
  Draw-Rect $g 7.2 11.2 9.6 1.7 $script:palette.Hair 0.4
  Draw-Line $g 8.1 12.2 15.9 12.2 $script:palette.Hair 0.8
}

function Draw-FrontTorso([System.Drawing.Graphics]$g, [System.Drawing.Color]$main, [System.Drawing.Color]$shade, [float]$y = 13.2, [float]$h = 7.2) {
  Draw-Ellipse $g 6.0 ($y - 0.5) 4.3 3.6 $main 0.8
  Draw-Ellipse $g 13.7 ($y - 0.5) 4.3 3.6 $main 0.8
  Draw-Rect $g 7.0 $y 10.0 $h $main 0.8
  Fill-Line $g 7.6 ($y + 1.1) 16.2 ($y + 1.1) $shade 0.45
  Fill-Line $g 12.0 ($y + 0.9) 12.0 ($y + $h - 0.4) $shade 0.35
}

function Draw-BackTorso([System.Drawing.Graphics]$g, [System.Drawing.Color]$main, [System.Drawing.Color]$shade, [float]$y = 13.0, [float]$h = 7.8) {
  Draw-Ellipse $g 6.3 ($y - 0.4) 4.2 3.4 $main 0.8
  Draw-Ellipse $g 13.5 ($y - 0.4) 4.2 3.4 $main 0.8
  Draw-Rect $g 7.2 $y 9.6 $h $main 0.8
  Fill-Line $g 8.0 ($y + 1.2) 16.0 ($y + 0.8) $shade 0.35
}

function Draw-Pants([System.Drawing.Graphics]$g, [float]$y = 20.2, [float]$spread = 0) {
  Draw-Ellipse $g (6.3 - $spread) $y 5.5 6.1 $script:palette.White 0.8
  Draw-Ellipse $g (12.2 + $spread) $y 5.5 6.1 $script:palette.White 0.8
  Fill-Line $g 9.0 ($y + 0.8) 9.0 ($y + 5.2) $script:palette.Gray 0.3
  Fill-Line $g 14.9 ($y + 0.8) 14.9 ($y + 5.2) $script:palette.Gray 0.3
}

function Draw-Shoes([System.Drawing.Graphics]$g, [float]$y = 26.5, [float]$spread = 0) {
  Draw-Ellipse $g (5.4 - $spread) $y 5.2 3.3 $script:palette.Black
  Draw-Ellipse $g (13.4 + $spread) $y 5.2 3.3 $script:palette.Black
  Draw-Ellipse $g (6.2 - $spread) ($y + 0.7) 2.0 1.0 $script:palette.BlackLight 0.2
  Draw-Ellipse $g (14.2 + $spread) ($y + 0.7) 2.0 1.0 $script:palette.BlackLight 0.2
}

function Draw-FrontBase([System.Drawing.Graphics]$g, [System.Drawing.Color]$main, [System.Drawing.Color]$shade, [switch]$CapOnly, [switch]$Serious, [float]$torsoY = 13.2, [float]$pantsY = 20.2, [float]$shoeY = 26.5, [float]$spread = 0) {
  Draw-FrontHelmet $g $main $shade 1 $CapOnly
  Draw-FrontFace $g $Serious
  Draw-FrontTorso $g $main $shade $torsoY
  Draw-Pants $g $pantsY $spread
  Draw-Shoes $g $shoeY $spread
}

function Draw-BackBase([System.Drawing.Graphics]$g, [System.Drawing.Color]$main, [System.Drawing.Color]$shade, [switch]$CapOnly, [float]$helmetY = 1, [float]$torsoY = 13, [float]$pantsY = 20.2, [float]$shoeY = 26.5, [float]$spread = 0) {
  Draw-BackHelmet $g $main $shade $helmetY $CapOnly
  Draw-BackHairBand $g
  Draw-BackTorso $g $main $shade $torsoY
  Draw-Pants $g $pantsY $spread
  Draw-Shoes $g $shoeY $spread
}

function Add-FrontButtons([System.Drawing.Graphics]$g, [int]$count = 2) {
  for ($i = 0; $i -lt $count; $i++) {
    Draw-Ellipse $g 11.0 (15.5 + ($i * 2.1)) 1.9 1.9 $script:palette.White 0.3
  }
}

function Draw-Pitcher([System.Drawing.Graphics]$g) {
  Draw-FrontBase $g $script:palette.Blue $script:palette.BlueDark -Serious -spread 0.9
  Add-FrontButtons $g 2
  Draw-Line $g 8.8 16.3 10.7 17.0 $script:palette.Blue 1.6
  Draw-Line $g 15.2 16.3 13.4 17.0 $script:palette.Blue 1.6
  Draw-Line $g 10.3 18.1 9.2 21.7 $script:palette.BlueDark 1.2
  Draw-Line $g 13.8 18.1 14.8 21.7 $script:palette.BlueDark 1.2
  Draw-Glove $g 12.0 18.2 6.2 5.4 2
  Draw-Ellipse $g 11.2 17.8 1.4 1.4 $script:palette.White 0.2
}

function Draw-Catcher([System.Drawing.Graphics]$g) {
  Draw-BackBase $g $script:palette.Blue $script:palette.BlueDark -helmetY 2.0 -torsoY 15.2 -pantsY 22.1 -shoeY 27.0 -spread 1.3
  Draw-Rect $g 8.0 15.4 8.0 4.8 $script:palette.GrayDark 0.6
  Draw-Line $g 9.0 15.8 9.0 20.0 $script:palette.Outline 0.4
  Draw-Line $g 15.0 15.8 15.0 20.0 $script:palette.Outline 0.4
  Draw-Line $g 7.8 12.4 16.2 12.4 $script:palette.Outline 0.6
  Draw-Line $g 6.5 12.1 7.8 16.5 $script:palette.Outline 0.5
  Draw-Line $g 17.5 12.1 16.2 16.5 $script:palette.Outline 0.5
  Draw-Line $g 8.5 18.0 7.4 21.8 $script:palette.BlueDark 1.2
  Draw-Line $g 15.5 18.0 16.6 21.8 $script:palette.BlueDark 1.2
  Draw-Glove $g 12.0 20.8 6.3 4.8 0
}

function Draw-FirstBaseman([System.Drawing.Graphics]$g) {
  Draw-FrontBase $g $script:palette.Blue $script:palette.BlueDark -Serious -spread 1.1
  Add-FrontButtons $g 2
  Draw-Line $g 8.0 16.2 7.1 19.0 $script:palette.Blue 1.5
  Draw-Line $g 15.0 16.1 18.7 16.9 $script:palette.Blue 1.5
  Draw-Glove $g 19.1 17.0 5.9 4.8 -18
  Draw-Line $g 15.6 18.2 14.8 22.2 $script:palette.BlueDark 1.1
  Draw-Line $g 8.9 18.4 8.2 22.4 $script:palette.BlueDark 1.1
}

function Draw-SecondBaseman([System.Drawing.Graphics]$g) {
  Draw-FrontBase $g $script:palette.Blue $script:palette.BlueDark -Serious -torsoY 14.1 -pantsY 20.9 -shoeY 26.7 -spread 0.6
  Add-FrontButtons $g 2
  Draw-Line $g 8.4 16.8 7.2 20.7 $script:palette.Blue 1.4
  Draw-Line $g 15.4 16.8 14.4 20.3 $script:palette.Blue 1.3
  Draw-Glove $g 7.0 21.0 5.6 4.5 18
  Draw-Line $g 9.4 19.2 8.5 23.3 $script:palette.BlueDark 1.1
  Draw-Line $g 14.8 19.0 15.8 23.2 $script:palette.BlueDark 1.1
}

function Draw-ThirdBaseman([System.Drawing.Graphics]$g) {
  Draw-FrontBase $g $script:palette.Blue $script:palette.BlueDark -Serious -torsoY 14.7 -pantsY 21.4 -shoeY 27.0 -spread 0.9
  Add-FrontButtons $g 2
  Draw-Line $g 8.5 17.0 10.2 21.5 $script:palette.Blue 1.5
  Draw-Line $g 15.4 17.0 13.7 21.5 $script:palette.Blue 1.5
  Draw-Glove $g 11.2 22.0 5.6 4.6 12
  Draw-Line $g 9.6 19.3 8.5 23.7 $script:palette.BlueDark 1.1
  Draw-Line $g 14.4 19.3 15.5 23.7 $script:palette.BlueDark 1.1
}

function Draw-LeftFielder([System.Drawing.Graphics]$g) {
  Draw-FrontBase $g $script:palette.Blue $script:palette.BlueDark -Serious -spread 0.2
  Add-FrontButtons $g 2
  Draw-Line $g 8.0 16.4 7.2 20.1 $script:palette.Blue 1.3
  Draw-Line $g 15.7 16.4 16.7 19.0 $script:palette.Blue 1.2
  Draw-Glove $g 16.8 19.3 5.2 4.3 -6
}

function Draw-CenterFielder([System.Drawing.Graphics]$g) {
  Draw-FrontBase $g $script:palette.Blue $script:palette.BlueDark -Serious -spread 1.2
  Add-FrontButtons $g 2
  Draw-Line $g 8.4 15.8 7.2 18.2 $script:palette.Blue 1.4
  Draw-Line $g 15.6 15.8 16.8 18.2 $script:palette.Blue 1.4
  Draw-Glove $g 15.9 17.2 5.6 4.7 -14
  Draw-Line $g 8.8 18.1 7.8 22.5 $script:palette.BlueDark 1.2
  Draw-Line $g 15.0 18.1 16.0 22.5 $script:palette.BlueDark 1.2
}

function Draw-BatterRight([System.Drawing.Graphics]$g) {
  Draw-BackBase $g $script:palette.Red $script:palette.RedDark -helmetY 1.0 -torsoY 13.2 -pantsY 20.1 -shoeY 26.5 -spread 0.8
  Draw-Bat $g 17.8 18.0 11 -24
  Draw-Line $g 9.0 16.4 8.1 19.9 $script:palette.Red 1.4
  Draw-Line $g 15.5 16.4 16.8 19.8 $script:palette.Red 1.3
}

function Draw-Runner([System.Drawing.Graphics]$g) {
  Draw-BackBase $g $script:palette.Red $script:palette.RedDark -CapOnly -helmetY 2.0 -torsoY 14.0 -pantsY 20.0 -shoeY 26.0 -spread 0.2
  Draw-Line $g 8.2 15.8 6.8 18.8 $script:palette.Red 1.4
  Draw-Line $g 15.8 15.9 16.9 18.1 $script:palette.Red 1.1
  Draw-Polygon $g @(@(8.2, 13.8), @(16.9, 13.0), @(16.0, 20.3), @(7.0, 20.9)) $script:palette.Red 0.8
  Draw-Ellipse $g 7.0 2.0 10.0 2.2 $script:palette.RedDark 0.2
  Draw-Polygon $g @(@(7.8, 20.2), @(11.2, 19.7), @(10.7, 27.1), @(7.5, 28.4), @(6.4, 25.0)) $script:palette.White 0.8
  Draw-Polygon $g @(@(12.0, 19.5), @(16.2, 19.1), @(18.0, 26.2), @(15.6, 29.2), @(12.7, 26.0)) $script:palette.White 0.8
  Draw-Ellipse $g 6.7 27.0 4.8 3.0 $script:palette.Black
  Draw-Ellipse $g 14.0 26.3 5.1 3.4 $script:palette.Black
}

function Draw-Umpire([System.Drawing.Graphics]$g) {
  Draw-BackBase $g $script:palette.Black $script:palette.BlackLight -CapOnly -helmetY 2.0 -torsoY 14.0 -pantsY 20.5 -shoeY 26.8 -spread 0.5
  Draw-Rect $g 7.2 9.4 9.6 1.3 $script:palette.BlackLight 0.2
  Draw-Line $g 8.5 16.3 10.5 18.7 $script:palette.Black 1.4
  Draw-Line $g 15.5 16.3 13.5 18.7 $script:palette.Black 1.4
  Draw-Line $g 10.5 18.6 13.5 18.6 $script:palette.BlackLight 0.6
}

function Write-Sprite([string]$name, [scriptblock]$drawFn) {
  $canvas = New-Canvas
  & $drawFn $canvas.Graphics
  Save-ScaledBitmap $canvas.Bitmap (Join-Path $outputDir $name)
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
}

function Flip-Horizontal([string]$sourceName, [string]$targetName) {
  $sourcePath = Join-Path $outputDir $sourceName
  $targetPath = Join-Path $outputDir $targetName
  $bmp = [System.Drawing.Bitmap]::FromFile($sourcePath)
  $bmp.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
  $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Make-PreviewSheet {
  $files = @(
    'field_pitcher.png','field_catcher.png','field_1b.png','field_2b.png','field_ss.png',
    'field_3b.png','field_lf.png','field_cf.png','field_rf.png','field_batter_r.png',
    'field_batter_l.png','field_runner.png','field_umpire.png'
  )

  $cellW = 176
  $cellH = 168
  $cols = 4
  $rows = [Math]::Ceiling($files.Count / $cols)
  $sheet = [System.Drawing.Bitmap]::new($cellW * $cols, $cellH * $rows, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($sheet)
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#F4F1E8'))
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $font = [System.Drawing.Font]::new('Consolas', 8, [System.Drawing.FontStyle]::Bold)
  $labelBrush = New-Brush $script:palette.Outline

  for ($i = 0; $i -lt $files.Count; $i++) {
    $col = $i % $cols
    $row = [Math]::Floor($i / $cols)
    $x = $col * $cellW
    $y = $row * $cellH

    $tileBrushA = New-Brush ([System.Drawing.ColorTranslator]::FromHtml('#E8E2D3'))
    $tileBrushB = New-Brush ([System.Drawing.ColorTranslator]::FromHtml('#F7F4EC'))
    for ($yy = 0; $yy -lt 88; $yy += 8) {
      for ($xx = 0; $xx -lt 88; $xx += 8) {
        $brush = if ((($xx / 8) + ($yy / 8)) % 2 -eq 0) { $tileBrushA } else { $tileBrushB }
        $g.FillRectangle($brush, $x + 20 + $xx, $y + 16 + $yy, 8, 8)
      }
    }
    $tileBrushA.Dispose()
    $tileBrushB.Dispose()

    $img = [System.Drawing.Bitmap]::FromFile((Join-Path $outputDir $files[$i]))
    $g.DrawImage($img, [System.Drawing.Rectangle]::new($x + 16, $y + 12, 96, 128))
    $img.Dispose()
    $g.DrawString($files[$i], $font, $labelBrush, [float]($x + 8), [float]($y + 138))
  }

  $font.Dispose()
  $labelBrush.Dispose()
  $g.Dispose()
  $sheet.Save((Join-Path $outputDir 'field_overview_preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $sheet.Dispose()
}

Write-Sprite 'field_pitcher.png' ${function:Draw-Pitcher}
Write-Sprite 'field_catcher.png' ${function:Draw-Catcher}
Write-Sprite 'field_1b.png' ${function:Draw-FirstBaseman}
Write-Sprite 'field_2b.png' ${function:Draw-SecondBaseman}
Write-Sprite 'field_3b.png' ${function:Draw-ThirdBaseman}
Write-Sprite 'field_lf.png' ${function:Draw-LeftFielder}
Write-Sprite 'field_cf.png' ${function:Draw-CenterFielder}
Write-Sprite 'field_batter_r.png' ${function:Draw-BatterRight}
Write-Sprite 'field_runner.png' ${function:Draw-Runner}
Write-Sprite 'field_umpire.png' ${function:Draw-Umpire}

Flip-Horizontal 'field_2b.png' 'field_ss.png'
Flip-Horizontal 'field_lf.png' 'field_rf.png'
Flip-Horizontal 'field_batter_r.png' 'field_batter_l.png'

Make-PreviewSheet
