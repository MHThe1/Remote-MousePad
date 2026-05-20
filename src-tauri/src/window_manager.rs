use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowInfo {
    pub id: u64,
    pub title: String,
}

/// List visible top-level windows using PowerShell (avoids Win32 API versioning issues).
#[cfg(target_os = "windows")]
pub fn list_windows() -> Vec<WindowInfo> {
    use std::process::Command;

    // PowerShell: enumerate all visible windows with non-empty titles
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinEnum {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lp, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int n);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public static List<string[]> GetWindows() {
        var list = new List<string[]>();
        EnumWindows((hWnd, lp) => {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(512);
            int len = GetWindowText(hWnd, sb, 512);
            if (len > 0) list.Add(new string[] { hWnd.ToInt64().ToString(), sb.ToString() });
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
"@
$windows = [WinEnum]::GetWindows()
foreach ($w in $windows) { Write-Output "$($w[0])|$($w[1])" }
"#,
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .filter_map(|line| {
                    let parts: Vec<&str> = line.splitn(2, '|').collect();
                    if parts.len() == 2 {
                        let id: u64 = parts[0].trim().parse().ok()?;
                        let title = parts[1].trim().to_string();
                        if !title.is_empty() {
                            Some(WindowInfo { id, title })
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect()
        }
        _ => vec![],
    }
}

/// Focus a window by its HWND value using PowerShell.
#[cfg(target_os = "windows")]
pub fn focus_window(id: u64) {
    use std::process::Command;
    let script = format!(
        r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {{
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}}
"@
$hwnd = [IntPtr]::new({id})
if ([WinFocus]::IsIconic($hwnd)) {{ [WinFocus]::ShowWindow($hwnd, 9) }}
[WinFocus]::SetForegroundWindow($hwnd)
"#
    );

    let _ = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .spawn();
}

#[cfg(not(target_os = "windows"))]
pub fn list_windows() -> Vec<WindowInfo> {
    vec![]
}

#[cfg(not(target_os = "windows"))]
pub fn focus_window(_id: u64) {}
