/**
 * PowerShell side of the Windows UI Automation control method.
 *
 * powershell.exe runs BOOTSTRAP (passed with -EncodedCommand, so the execution policy does not apply). It reads
 * HELPER_SCRIPT from stdin up to SCRIPT_END and runs it. The helper then speaks JSON lines:
 *
 * stdin (module → helper):
 *   {"cmd":"config","pollMs":500,"selfTilePattern":"^Myself video\\b"}
 *   {"cmd":"press","id":1,"target":"microphone-button"}
 *   {"cmd":"press","id":2,"target":"like-button","menu":"reaction-menu-button"}  opens the menu if needed, then Escape
 *   {"cmd":"blur","id":3}     toggles background blur; the result carries "blurred": true/false
 *   {"cmd":"exit"}
 *
 * stdout (helper → module):
 *   {"type":"ready"}
 *   ("blur": true/false is added while the video options menu is open, the only place Teams shows it)
 *   {"type":"snapshot","teams":true,"meeting":true,"compact":false,"menuOpen":false,"buttons":{"<automation id>":{"name":"…","enabled":true,"expanded":false,"style":"___1lj7lvq"}},"self":"<your video tile's name, or null>"}
 *   {"type":"result","id":1,"ok":true}   or   {"type":"result","id":1,"ok":false,"error":"…"}
 *   {"type":"log","level":"debug","message":"…"}
 *   {"type":"fatal","message":"…"}       the helper cannot work on this computer and exits
 *
 * Clicks are posted to Teams' Chromium render widget, so Teams does not take focus and works while covered or
 * minimised. UI Automation Invoke is not used because it brings Teams to the front.
 *
 * Written inside String.raw: the script must not contain backticks or "${".
 */

export const SCRIPT_END = '#END-OF-HELPER'

export const BOOTSTRAP = String.raw`
$ErrorActionPreference = 'Stop'
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {
	'{"type":"fatal","message":"PowerShell runs in ' + $ExecutionContext.SessionState.LanguageMode + ' mode on this computer (AppLocker or WDAC policy), which blocks UI Automation"}'
	exit 1
}
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), (New-Object System.Text.UTF8Encoding $false))
$code = New-Object System.Text.StringBuilder
while ($true) {
	$line = $reader.ReadLine()
	if ($null -eq $line -or $line -eq '${SCRIPT_END}') { break }
	[void]$code.AppendLine($line)
}
. ([scriptblock]::Create($code.ToString()))
`

export const HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding $false))
$out.AutoFlush = $true
function Send-Message($obj) { $out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 5)) }

try {
	Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
	Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class TeamsWin {
	[DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
	[DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h, ref POINT p);
	[DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
	[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
	[DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
	[DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
	delegate bool EnumProc(IntPtr h, IntPtr l);
	[StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }

	// Physical pixels everywhere, so UI Automation bounds and client coordinates agree on scaled displays
	public static void MakeDpiAware() {
		try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
	}

	static IntPtr FindRenderWidget(IntPtr top) {
		IntPtr found = IntPtr.Zero;
		EnumChildWindows(top, (h, l) => {
			var sb = new StringBuilder(256);
			GetClassName(h, sb, 256);
			if (sb.ToString() == "Chrome_RenderWidgetHostHWND" && IsWindowVisible(h)) { found = h; return false; }
			return true;
		}, IntPtr.Zero);
		return found;
	}

	public static bool Click(IntPtr top, double x, double y) {
		IntPtr render = FindRenderWidget(top);
		if (render == IntPtr.Zero) return false;
		POINT p;
		p.X = (int)Math.Round(x);
		p.Y = (int)Math.Round(y);
		if (!ScreenToClient(render, ref p)) return false;
		IntPtr l = new IntPtr(((p.Y & 0xFFFF) << 16) | (p.X & 0xFFFF));
		PostMessage(render, 0x0200, IntPtr.Zero, l);      // WM_MOUSEMOVE
		PostMessage(render, 0x0201, new IntPtr(1), l);    // WM_LBUTTONDOWN
		PostMessage(render, 0x0202, IntPtr.Zero, l);      // WM_LBUTTONUP
		return true;
	}

	// WM_MOUSELEAVE, so the last button pressed does not stay hovered. Sent once at the end of an action: a leave
	// between opening a menu and clicking its item makes every other menu click miss.
	public static void Leave(IntPtr top) {
		IntPtr render = FindRenderWidget(top);
		if (render != IntPtr.Zero) PostMessage(render, 0x02A3, IntPtr.Zero, IntPtr.Zero);
	}

	public static bool Key(IntPtr top, int vk) {
		IntPtr render = FindRenderWidget(top);
		if (render == IntPtr.Zero) return false;
		PostMessage(render, 0x0100, new IntPtr(vk), new IntPtr(1));                      // WM_KEYDOWN
		PostMessage(render, 0x0101, new IntPtr(vk), new IntPtr(unchecked((int)0xC0000001))); // WM_KEYUP
		return true;
	}
}
'@
} catch {
	Send-Message @{ type = 'fatal'; message = 'Could not load UI Automation: ' + $_.Exception.Message }
	exit 1
}
[TeamsWin]::MakeDpiAware()

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$PC = [System.Windows.Automation.PropertyCondition]
$ExpandPattern = [System.Windows.Automation.ExpandCollapsePattern]::Pattern
$Collapsed = [System.Windows.Automation.ExpandCollapseState]::Collapsed

# Toolbar buttons reported in snapshots
# (More and Controls are only read for their style, which shows what an unhighlighted button looks like)
$ButtonIds = @('microphone-button', 'video-button', 'video-button-configure', 'share-button', 'reaction-menu-button', 'raisehands-button', 'chat-button', 'roster-button', 'hangup-button', 'callingButtons-showMoreBtn', 'organizer-control-button')
$IdCondition = New-Object System.Windows.Automation.OrCondition(, [System.Windows.Automation.Condition[]]@($ButtonIds | ForEach-Object { New-Object $PC($AE::AutomationIdProperty, $_) }))
$MenuCondition = New-Object $PC($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Menu)
$CheckBoxCondition = New-Object $PC($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::CheckBox)
$TogglePattern = [System.Windows.Automation.TogglePattern]::Pattern
$ToggleOn = [System.Windows.Automation.ToggleState]::On

$TileCondition = New-Object System.Windows.Automation.OrCondition(
	(New-Object $PC($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Image)),
	(New-Object $PC($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::MenuItem)))
# Name pattern of your own video tile; set by the module with the "config" command
$script:SelfTilePattern = $null
$TileSearchMs = 2000

$PollMs = 500
# Time for a menu's open animation, from clicking its button to clicking an item
$MenuOpenMs = 400
$DiscoveryMs = 2000
# How long the toolbar may be hidden (by an open menu) before the meeting is taken to have ended
$ToolbarHiddenMs = 15000
$script:meeting = $null
$script:nextDiscovery = [DateTime]::MinValue
$script:lastSnapshot = ''
$script:lastError = ''
$script:running = $true

function Get-TeamsWindows {
	$procs = @(Get-Process -Name ms-teams -ErrorAction SilentlyContinue)
	if ($procs.Count -eq 0) { return $null }
	$conds = @($procs | ForEach-Object { New-Object $PC($AE::ProcessIdProperty, $_.Id) })
	$cond = if ($conds.Count -eq 1) { $conds[0] } else { New-Object System.Windows.Automation.OrCondition(, [System.Windows.Automation.Condition[]]$conds) }
	,@($AE::RootElement.FindAll($TS::Children, $cond))
}

function Read-Buttons($root) {
	$map = @{}
	foreach ($e in $root.FindAll($TS::Descendants, $IdCondition)) {
		$c = $e.Current
		$info = @{ name = $c.Name; enabled = $c.IsEnabled }
		# The generated style class (the one starting ___) shows highlights, such as the React button while your hand
		# is raised. The names change between Teams builds, so they are only compared with other buttons.
		$style = ($c.ClassName -split ' ') | Where-Object { $_.StartsWith('___') } | Select-Object -First 1
		if ($style) { $info.style = $style }
		$p = $null
		if ($e.TryGetCurrentPattern($ExpandPattern, [ref]$p)) { $info.expanded = ($p.Current.ExpandCollapseState -ne $Collapsed) }
		$map[$c.AutomationId] = $info
	}
	$map
}

# The meeting window is the Teams window with a Leave button. Minimising it opens a compact view window with a
# smaller toolbar (no chat button); both stay in sync, so the full window is preferred even while minimised.
function Find-Meeting($windows) {
	$compact = $null
	foreach ($w in $windows) {
		$buttons = Read-Buttons $w
		if (-not $buttons.ContainsKey('hangup-button')) { continue }
		$m = @{ Element = $w; Handle = [IntPtr]$w.Current.NativeWindowHandle; Compact = -not $buttons.ContainsKey('chat-button'); Buttons = $buttons }
		if (-not $m.Compact) { return $m }
		if (-not $compact) { $compact = $m }
	}
	$compact
}

# The name of your own video tile, which lists your status (including a raised hand, which the toolbar does not
# show). The tile element is kept between polls; searching for it again is throttled because it walks the window.
function Get-SelfTileName($m) {
	if (-not $script:SelfTilePattern) { return $null }
	if ($m.Tile) {
		try {
			$name = $m.Tile.Current.Name
			if ($name -match $script:SelfTilePattern) { return $name }
		} catch { }
		$m.Tile = $null
	}
	$now = [DateTime]::UtcNow
	if ($m.NextTileSearch -and $now -lt $m.NextTileSearch) { return $null }
	$m.NextTileSearch = $now.AddMilliseconds($TileSearchMs)
	foreach ($e in $m.Element.FindAll($TS::Descendants, $TileCondition)) {
		$name = $e.Current.Name
		if ($name -match $script:SelfTilePattern) {
			$m.Tile = $e
			return $name
		}
	}
	$null
}

function Get-Snapshot {
	$windows = Get-TeamsWindows
	if ($null -eq $windows) {
		$script:meeting = $null
		return @{ type = 'snapshot'; teams = $false; meeting = $false }
	}

	$now = [DateTime]::UtcNow
	$m = $script:meeting
	if ($m -and -not [TeamsWin]::IsWindow($m.Handle)) { $m = $null }

	if ($m -and -not ($m.Compact -and $now -ge $script:nextDiscovery)) {
		$buttons = Read-Buttons $m.Element
		if ($buttons.ContainsKey('hangup-button')) {
			$m.Buttons = $buttons
			$m.HiddenSince = $null
		} else {
			# A menu opened in Teams (such as React) hides the toolbar from UI Automation, and not every menu is a
			# Menu element. Teams closes the meeting window when a meeting ends, so while the window is still there,
			# keep the last state; give up only if the toolbar stays hidden for a long time.
			if (-not $m.HiddenSince) { $m.HiddenSince = $now }
			if (($now - $m.HiddenSince).TotalMilliseconds -lt $ToolbarHiddenMs) {
				$script:meeting = $m
				$snapshot = @{ type = 'snapshot'; teams = $true; meeting = $true; compact = $m.Compact; menuOpen = $true; buttons = @{} }
				# Teams shows the background effect only in the video options menu, so read it whenever that menu is open
				$fx = Get-BackgroundEffects $m
				if ($fx) { $snapshot.blur = [bool](Test-On $fx.Blur) }
				return $snapshot
			}
			$m = $null
		}
	} elseif ($now -ge $script:nextDiscovery) {
		$script:nextDiscovery = $now.AddMilliseconds($DiscoveryMs)
		$found = Find-Meeting $windows
		if ($found) { $m = $found }
	} else {
		$m = $null
	}

	$script:meeting = $m
	if (-not $m) { return @{ type = 'snapshot'; teams = $true; meeting = $false } }
	@{ type = 'snapshot'; teams = $true; meeting = $true; compact = $m.Compact; menuOpen = $false; buttons = $m.Buttons; self = (Get-SelfTileName $m) }
}

function Get-ActiveMeeting {
	$m = $script:meeting
	if ($m -and [TeamsWin]::IsWindow($m.Handle)) { return $m }
	$windows = Get-TeamsWindows
	if ($null -eq $windows) { throw 'Teams is not running' }
	$script:meeting = Find-Meeting $windows
	if (-not $script:meeting) { throw 'Not in a meeting' }
	$script:meeting
}

function Find-Id($root, $id) { $root.FindFirst($TS::Descendants, (New-Object $PC($AE::AutomationIdProperty, $id))) }

function Invoke-Click($m, $el, $label) {
	$r = $el.Current.BoundingRectangle
	if ($r.IsEmpty -or $r.Width -le 0) { throw "The $label button has no position on screen" }
	if (-not [TeamsWin]::Click($m.Handle, $r.X + $r.Width / 2, $r.Y + $r.Height / 2)) { throw 'Could not find the Teams render window' }
}

function Test-Expanded($el) {
	$p = $null
	$el.TryGetCurrentPattern($ExpandPattern, [ref]$p) -and $p.Current.ExpandCollapseState -ne $Collapsed
}

# Menus slide in, so a freshly found item may still be moving. Wait until its position is the same on two reads.
function Wait-Settled($el) {
	$last = $el.Current.BoundingRectangle
	$deadline = [DateTime]::UtcNow.AddMilliseconds(800)
	while ([DateTime]::UtcNow -lt $deadline) {
		Start-Sleep -Milliseconds 50
		$now = $el.Current.BoundingRectangle
		if ($now -eq $last) { return }
		$last = $now
	}
}

# Close a menu we opened by clicking its button again, where it was before the menu opened (an open menu hides it
# from UI Automation). Escape would also close it, but a keyboard close leaves a focus box and tooltip on the button.
# Escape is the fallback if the menu is still open.
function Close-Menu($m, $openerId, $openerRect) {
	$opener = Find-Id $m.Element $openerId
	if ($opener -and -not (Test-Expanded $opener)) { return }   # already closed
	[void][TeamsWin]::Click($m.Handle, $openerRect.X + $openerRect.Width / 2, $openerRect.Y + $openerRect.Height / 2)
	Start-Sleep -Milliseconds 300
	$opener = Find-Id $m.Element $openerId
	if (-not $opener -or (Test-Expanded $opener)) { [void][TeamsWin]::Key($m.Handle, 0x1B) }
}

function Invoke-Press($target, $menu) {
	$m = Get-ActiveMeeting

	# Whether a menu is open comes from its button's expand state: the menu's items stay in the tree for a moment
	# after it closes, so finding an item does not mean it can be clicked. A hidden opener means a menu is open.
	$opener = if ($menu) { Find-Id $m.Element $menu } else { $null }
	if ($opener -and -not (Test-Expanded $opener)) {
		$openerRect = $opener.Current.BoundingRectangle
		Invoke-Click $m $opener $menu
		$openedAt = [DateTime]::UtcNow
		$el = $null
		$deadline = [DateTime]::UtcNow.AddSeconds(2)
		do {
			Start-Sleep -Milliseconds 100
			$el = Find-Id $m.Element $target
		} until ($el -or [DateTime]::UtcNow -gt $deadline)
		if (-not $el) {
			[void][TeamsWin]::Key($m.Handle, 0x1B)
			throw "The $target button did not appear in the menu"
		}
		# The menu ignores clicks while it slides in, and UI Automation does not report every step of the
		# animation, so always allow it time to finish (tested: clicking at ~150 ms misses every other time)
		$remaining = $MenuOpenMs - ([DateTime]::UtcNow - $openedAt).TotalMilliseconds
		if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int]$remaining) }
		Wait-Settled $el
		Invoke-Click $m $el $target
		# The menu stays open after a choice; close it so the toolbar is visible again
		Start-Sleep -Milliseconds 300
		Close-Menu $m $menu $openerRect
		return
	}

	$el = Find-Id $m.Element $target
	if (-not $el) { throw "The $target button was not found" }
	Invoke-Click $m $el $target
}

function Test-On($el) {
	$p = $null
	$el.TryGetCurrentPattern($TogglePattern, [ref]$p) -and $p.Current.ToggleState -eq $ToggleOn
}

# The video options menu lists background effects as checkboxes: "No background effect" first, then "Standard
# blur" (the only one with an expand/collapse pattern), then background images. Matching by position and pattern
# works in any Teams language; the English name is a fallback.
function Get-BackgroundEffects($m) {
	$menu = $m.Element.FindFirst($TS::Descendants, $MenuCondition)
	if (-not $menu) { return $null }
	$boxes = @($menu.FindAll($TS::Descendants, $CheckBoxCondition))
	if ($boxes.Count -lt 2) { return $null }
	$blur = $null
	foreach ($b in $boxes) {
		$p = $null
		if ($b.TryGetCurrentPattern($ExpandPattern, [ref]$p)) { $blur = $b; break }
	}
	if (-not $blur) { $blur = $boxes | Where-Object { $_.Current.Name -match 'blur' } | Select-Object -First 1 }
	if (-not $blur) { $blur = $boxes[1] }
	@{ Boxes = $boxes; None = $boxes[0]; Blur = $blur }
}

# Toggle background blur. Turning blur off selects "No background effect", like the Teams API did.
# Returns whether blur is now on.
function Invoke-ToggleBlur {
	$m = Get-ActiveMeeting
	$fx = Get-BackgroundEffects $m
	$opened = $false
	if (-not $fx) {
		$opener = Find-Id $m.Element 'video-button-configure'
		if (-not $opener) { throw 'The video options button was not found (the compact view does not have one)' }
		$openerRect = $opener.Current.BoundingRectangle
		Invoke-Click $m $opener 'video options'
		$openedAt = [DateTime]::UtcNow
		$opened = $true
		$deadline = [DateTime]::UtcNow.AddSeconds(3)
		do {
			Start-Sleep -Milliseconds 150
			$fx = Get-BackgroundEffects $m
		} until ($fx -or [DateTime]::UtcNow -gt $deadline)
		if (-not $fx) {
			[void][TeamsWin]::Key($m.Handle, 0x1B)
			throw 'The background effects did not appear in the video options menu'
		}
		$remaining = $MenuOpenMs - ([DateTime]::UtcNow - $openedAt).TotalMilliseconds
		if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int]$remaining) }
	}

	$blurName = $fx.Blur.Current.Name
	if (Test-On $fx.Blur) {
		$target = $fx.None
		$blurred = $false
	} else {
		$target = $fx.Blur
		$blurred = $true
	}
	Wait-Settled $target
	Invoke-Click $m $target 'background effect'

	# Read the result back if the menu is still open, then close it if we opened it
	Start-Sleep -Milliseconds 500
	$after = Get-BackgroundEffects $m
	if ($after) {
		$blurBox = $after.Boxes | Where-Object { $_.Current.Name -eq $blurName } | Select-Object -First 1
		if ($blurBox) { $blurred = [bool](Test-On $blurBox) }
		if ($opened) { Close-Menu $m 'video-button-configure' $openerRect }
	}
	$blurred
}

function Clear-Hover {
	if ($script:meeting) { [TeamsWin]::Leave($script:meeting.Handle) }
}

function Invoke-CommandLine($line) {
	$msg = $null
	try { $msg = $line | ConvertFrom-Json } catch { Send-Message @{ type = 'log'; level = 'warn'; message = 'Ignoring invalid command: ' + $line }; return }
	switch ($msg.cmd) {
		'config' {
			if ($msg.pollMs -ge 100) { $script:PollMs = [int]$msg.pollMs }
			if ($msg.selfTilePattern) { $script:SelfTilePattern = '(?i)' + $msg.selfTilePattern }
		}
		'exit' { $script:running = $false }
		'press' {
			try {
				Invoke-Press $msg.target $msg.menu
				Send-Message @{ type = 'result'; id = $msg.id; ok = $true }
			} catch {
				Send-Message @{ type = 'result'; id = $msg.id; ok = $false; error = $_.Exception.Message }
			} finally {
				Clear-Hover
			}
		}
		'blur' {
			try {
				$blurred = Invoke-ToggleBlur
				Send-Message @{ type = 'result'; id = $msg.id; ok = $true; blurred = [bool]$blurred }
			} catch {
				Send-Message @{ type = 'result'; id = $msg.id; ok = $false; error = $_.Exception.Message }
			} finally {
				Clear-Hover
			}
		}
		default { Send-Message @{ type = 'log'; level = 'warn'; message = 'Unknown command: ' + $msg.cmd } }
	}
}

Send-Message @{ type = 'ready' }
$pending = $reader.ReadLineAsync()
$nextPoll = [DateTime]::UtcNow
while ($script:running) {
	$wait = [int][Math]::Max(0, ($nextPoll - [DateTime]::UtcNow).TotalMilliseconds)
	if ($pending.Wait($wait)) {
		$line = $pending.Result
		if ($null -eq $line) { break }   # the module closed stdin
		$pending = $reader.ReadLineAsync()
		if ($line.Trim()) {
			Invoke-CommandLine $line
			# Report the effect of a button press quickly
			$soon = [DateTime]::UtcNow.AddMilliseconds(150)
			if ($soon -lt $nextPoll) { $nextPoll = $soon }
		}
		continue
	}

	try {
		$json = Get-Snapshot | ConvertTo-Json -Compress -Depth 5
		if ($json -ne $script:lastSnapshot) {
			$script:lastSnapshot = $json
			$out.WriteLine($json)
		}
		$script:lastError = ''
	} catch {
		# Elements disappear while Teams redraws; start over on the next poll
		$script:meeting = $null
		$text = $_.Exception.Message
		if ($text -ne $script:lastError) {
			$script:lastError = $text
			Send-Message @{ type = 'log'; level = 'debug'; message = 'Poll failed: ' + $text }
		}
	}
	$nextPoll = [DateTime]::UtcNow.AddMilliseconds($script:PollMs)
}
`
