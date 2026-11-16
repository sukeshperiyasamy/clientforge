Option Explicit
Dim shell, fs, root, nodePath, scriptPath, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
nodePath = fs.BuildPath(root, ".tools\node-v24.11.1-win-x64\node.exe")
scriptPath = fs.BuildPath(root, "scripts\launch-browser.ts")
If Not fs.FileExists(nodePath) Then
  MsgBox "The project Node runtime is missing. Run the project setup first.", 48, "FreelanceGrowth Browser"
  WScript.Quit 1
End If
shell.CurrentDirectory = root
command = Chr(34) & nodePath & Chr(34) & " --import tsx " & Chr(34) & scriptPath & Chr(34)
shell.Run command, 0, False
