' Starts ABPV.ps1 hidden (no console window flash). Used by the desktop and Start menu shortcuts.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & dir & "\ABPV.ps1""", 0, False
