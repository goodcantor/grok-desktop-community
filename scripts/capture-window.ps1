param([long]$WindowHandle,[string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LayoutWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window,IntPtr dc,uint flags);
}
'@
$taskRect=New-Object LayoutWindowCapture+Rect
if(-not [LayoutWindowCapture]::GetWindowRect([IntPtr]$WindowHandle,[ref]$taskRect)){throw 'Cannot locate the test window'}
$taskBitmap=New-Object System.Drawing.Bitmap ($taskRect.Right-$taskRect.Left),($taskRect.Bottom-$taskRect.Top)
$taskGraphics=[System.Drawing.Graphics]::FromImage($taskBitmap)
$taskDc=$taskGraphics.GetHdc()
try {
  if(-not [LayoutWindowCapture]::PrintWindow([IntPtr]$WindowHandle,$taskDc,2)){throw 'Cannot capture the test window'}
} finally { $taskGraphics.ReleaseHdc($taskDc);$taskGraphics.Dispose() }
try { $taskBitmap.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png) } finally { $taskBitmap.Dispose() }
