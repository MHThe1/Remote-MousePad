use enigo::{
    Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RemoteCommand {
    MouseMove { dx: i32, dy: i32 },
    MouseClick { button: MouseButton },
    MouseDown { button: MouseButton },
    MouseUp { button: MouseButton },
    Scroll { dx: i32, dy: i32 },
    KeyPress { key: String },
    Text { text: String },
    Media { action: MediaAction },
    Power { action: PowerAction },
    GetWindows,
    FocusWindow { id: u64 },
    SetClipboard { text: String },
    GetClipboard,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum MediaAction {
    PlayPause,
    Next,
    Prev,
    VolUp,
    VolDown,
    Mute,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum PowerAction {
    Sleep,
    Lock,
    Restart,
    Shutdown,
}

pub struct InputHandler {
    enigo: Enigo,
}

impl InputHandler {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let enigo = Enigo::new(&Settings::default())?;
        Ok(Self { enigo })
    }

    pub fn handle(&mut self, cmd: RemoteCommand) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match cmd {
            RemoteCommand::MouseMove { dx, dy } => {
                self.enigo.move_mouse(dx, dy, Coordinate::Rel)?;
            }
            RemoteCommand::MouseClick { button } => {
                let btn = map_button(&button);
                self.enigo.button(btn, Direction::Click)?;
            }
            RemoteCommand::MouseDown { button } => {
                let btn = map_button(&button);
                self.enigo.button(btn, Direction::Press)?;
            }
            RemoteCommand::MouseUp { button } => {
                let btn = map_button(&button);
                self.enigo.button(btn, Direction::Release)?;
            }
            RemoteCommand::Scroll { dx, dy } => {
                if dy != 0 {
                    self.enigo.scroll(dy, enigo::Axis::Vertical)?;
                }
                if dx != 0 {
                    self.enigo.scroll(dx, enigo::Axis::Horizontal)?;
                }
            }
            RemoteCommand::KeyPress { ref key } => {
                handle_key_press(&mut self.enigo, key)?;
            }
            RemoteCommand::Text { ref text } => {
                self.enigo.text(text)?;
            }
            RemoteCommand::Media { ref action } => {
                handle_media(&mut self.enigo, action)?;
            }
            RemoteCommand::Power { ref action } => {
                handle_power(action)?;
            }
            RemoteCommand::GetWindows
            | RemoteCommand::FocusWindow { .. }
            | RemoteCommand::SetClipboard { .. }
            | RemoteCommand::GetClipboard => {
                // handled in ws_server
            }
        }
        Ok(())
    }
}

fn map_button(button: &MouseButton) -> Button {
    match button {
        MouseButton::Left => Button::Left,
        MouseButton::Right => Button::Right,
        MouseButton::Middle => Button::Middle,
    }
}

fn handle_key_press(
    enigo: &mut Enigo,
    key_str: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let parts: Vec<&str> = key_str.split('+').collect();
    let modifiers: Vec<&str> = parts[..parts.len().saturating_sub(1)].to_vec();
    let main_key = parts.last().unwrap_or(&"");

    // Press modifiers
    for modifier in &modifiers {
        if let Some(k) = str_to_modifier(modifier) {
            enigo.key(k, Direction::Press)?;
        }
    }

    // Press + release main key
    if let Some(k) = str_to_key(main_key) {
        enigo.key(k, Direction::Click)?;
    }

    // Release modifiers in reverse
    for modifier in modifiers.iter().rev() {
        if let Some(k) = str_to_modifier(modifier) {
            enigo.key(k, Direction::Release)?;
        }
    }

    Ok(())
}

fn str_to_modifier(s: &str) -> Option<Key> {
    match s.to_lowercase().as_str() {
        "ctrl" | "control" => Some(Key::Control),
        "alt" => Some(Key::Alt),
        "shift" => Some(Key::Shift),
        "win" | "super" | "meta" => Some(Key::Meta),
        _ => None,
    }
}

fn str_to_key(s: &str) -> Option<Key> {
    match s.to_lowercase().as_str() {
        "enter" | "return" => Some(Key::Return),
        "backspace" => Some(Key::Backspace),
        "tab" => Some(Key::Tab),
        "escape" | "esc" => Some(Key::Escape),
        "space" | " " => Some(Key::Space),
        "delete" | "del" => Some(Key::Delete),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" => Some(Key::PageUp),
        "pagedown" => Some(Key::PageDown),
        "up" => Some(Key::UpArrow),
        "down" => Some(Key::DownArrow),
        "left" => Some(Key::LeftArrow),
        "right" => Some(Key::RightArrow),
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        "ctrl" | "control" => Some(Key::Control),
        "alt" => Some(Key::Alt),
        "shift" => Some(Key::Shift),
        "win" | "super" | "meta" => Some(Key::Meta),
        "capslock" => Some(Key::CapsLock),
        "insert" => Some(Key::Insert),
        s if s.len() == 1 => {
            let c = s.chars().next()?;
            Some(Key::Unicode(c))
        }
        _ => None,
    }
}

fn handle_media(
    enigo: &mut Enigo,
    action: &MediaAction,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let key = match action {
        MediaAction::PlayPause => Key::MediaPlayPause,
        MediaAction::Next => Key::MediaNextTrack,
        MediaAction::Prev => Key::MediaPrevTrack,
        MediaAction::VolUp => Key::VolumeUp,
        MediaAction::VolDown => Key::VolumeDown,
        MediaAction::Mute => Key::VolumeMute,
    };
    enigo.key(key, Direction::Click)?;
    Ok(())
}

fn handle_power(action: &PowerAction) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        match action {
            PowerAction::Sleep => {
                Command::new("rundll32.exe")
                    .args(["powrprof.dll,SetSuspendState", "0,1,0"])
                    .spawn()?;
            }
            PowerAction::Lock => {
                Command::new("rundll32.exe")
                    .args(["user32.dll,LockWorkStation"])
                    .spawn()?;
            }
            PowerAction::Restart => {
                Command::new("shutdown")
                    .args(["/r", "/t", "5"])
                    .spawn()?;
            }
            PowerAction::Shutdown => {
                Command::new("shutdown")
                    .args(["/s", "/t", "5"])
                    .spawn()?;
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        match action {
            PowerAction::Sleep => { Command::new("pmset").args(["sleepnow"]).spawn()?; }
            PowerAction::Lock => { Command::new("pmset").args(["displaysleepnow"]).spawn()?; }
            PowerAction::Restart => { Command::new("shutdown").args(["-r", "now"]).spawn()?; }
            PowerAction::Shutdown => { Command::new("shutdown").args(["-h", "now"]).spawn()?; }
        }
    }
    Ok(())
}
