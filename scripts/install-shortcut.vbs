Option Explicit
Dim shell, fs, root, desktop, linkPath, shortcut
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(fs.GetParentFolderName(WScript.ScriptFullName))
desktop = shell.SpecialFolders("Desktop")
linkPath = fs.BuildPath(desktop, "FreelanceGrowth Browser.lnk")
If fs.FileExists(linkPath) Then
  Set shortcut = shell.CreateShortcut(linkPath)
  If InStr(1, shortcut.Arguments, root, vbTextCompare) = 0 Then
    WScript.Echo "A different shortcut already has this name. It was not overwritten."
    WScript.Quit 1
  End If
End If
Set shortcut = shell.CreateShortcut(linkPath)
shortcut.TargetPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")
shortcut.Arguments = Chr(34) & fs.BuildPath(root, "launch-browser.vbs") & Chr(34)
shortcut.WorkingDirectory = root
shortcut.Description = "Open the isolated persistent FreelanceGrowth project browser"
If fs.FileExists("C:\Program Files\Google\Chrome\Application\chrome.exe") Then shortcut.IconLocation = "C:\Program Files\Google\Chrome\Application\chrome.exe,0"
shortcut.Save
WScript.Echo "Created desktop shortcut: " & linkPath
