Option Explicit
Dim shell, fs, root, nodePath, command, result
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
nodePath = fs.BuildPath(root, ".tools\node-v24.11.1-win-x64\node.exe")
If Not fs.FileExists(nodePath) Then WScript.Quit 1
shell.CurrentDirectory = root
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & fs.BuildPath(root, "scripts\background-server.mjs") & Chr(34)
result = shell.Run(command, 0, True)
WScript.Quit result
