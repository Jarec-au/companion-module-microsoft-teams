## Microsoft Teams

Control the Microsoft Teams desktop app (Teams for work or school) from Companion.

Teams Classic is no longer supported. If you used this module with Teams Classic, your buttons are upgraded automatically, but you need to pair again (see below).

### Control method

Choose how the module talks to Teams in the connection settings:

| Control method                 | Platforms         | Teams on another computer | Status                                                                                                     |
| ------------------------------ | ----------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Teams third-party API (legacy) | Windows and macOS | Yes                       | Retired by Microsoft on 30 June 2026. Some Teams versions still answer it, but it can stop working anytime |
| Windows UI Automation          | Windows only      | No                        | Presses the buttons on the Teams meeting toolbar. Can break when Microsoft changes the Teams layout        |

On macOS and Linux only the Teams API is offered. A connection set up for Windows UI Automation (for example in a config copied from a Windows computer) uses the Teams API there instead, and says so in the log.

### Setup (Teams third-party API)

1. In Teams, open **Settings → Privacy**, scroll to the bottom, choose **Manage API** and turn the API on.
2. Add this module in Companion. Leave **API token** empty. If Teams runs on the same computer as Companion, keep the target IP at `127.0.0.1`.
3. Join a meeting in Teams and press any button that uses this module.
4. Teams asks whether to allow the device. Allow it, and the token is saved automatically.

Microsoft's guide: [Connect to third-party devices in Microsoft Teams](https://support.microsoft.com/en-us/office/connect-to-third-party-devices-in-microsoft-teams-aabca9f2-47bb-407f-9f9b-81a104a883d6)

### Setup (Windows UI Automation)

1. Run Companion and Teams on the same Windows computer, signed in to the same Windows account.
2. Choose **Windows UI Automation** as the control method. There is nothing to pair.

The module starts a hidden PowerShell process that reads the meeting toolbar and presses its buttons. Teams does not come to the front, and it keeps working while the meeting window is covered or minimised.

- Mute and camera feedback read the button labels, so they need Teams in English. Other languages can still press the buttons.
- The raised hand is read from the highlight on the React button, so it follows Teams whoever raises or lowers your hand. While a Teams menu is open it cannot be read, and the feedback updates once the menu closes.
- While a Teams menu is open, the toolbar is hidden from the module, so feedback pauses until the menu closes.
- Computers that lock down PowerShell (Constrained Language Mode through AppLocker or WDAC) block this method; the connection status says so.

### Actions

| Action                                       | Teams API | Windows UI Automation |
| -------------------------------------------- | --------- | --------------------- |
| Toggle mute                                  | Yes       | Yes                   |
| Toggle video                                 | Yes       | Yes                   |
| Toggle background blur                       | Yes       | Yes                   |
| Toggle raise hand                            | Yes       | Yes                   |
| Leave meeting                                | Yes       | Yes                   |
| Reaction (applause, laugh, like, heart, wow) | Yes       | Yes                   |
| Toggle chat pane                             | Yes       | Yes                   |
| Toggle people pane                           | No        | Yes                   |
| Stop sharing                                 | Yes       | Yes                   |

**Leave meeting** ends the call straight away, without asking for confirmation.

### Feedbacks and variables

Each of these is available as a boolean feedback and as a variable with the same id, for example `$(teams:isMuted)` when your connection is labelled `teams`.

| Id                    | Meaning                                             | Teams API | Windows UI Automation  |
| --------------------- | --------------------------------------------------- | --------- | ---------------------- |
| `isMuted`             | Your microphone is muted                            | Yes       | Yes (Teams in English) |
| `isVideoOn`           | Your camera is on                                   | Yes       | Yes (Teams in English) |
| `isHandRaised`        | Your hand is raised                                 | Yes       | Yes                    |
| `isInMeeting`         | You are in a meeting                                | Yes       | Yes                    |
| `isRecordingOn`       | The meeting is being recorded                       | Yes       | No                     |
| `isBackgroundBlurred` | Background blur is on                               | Yes       | Yes (see below)        |
| `isSharing`           | Someone in the meeting is sharing                   | Yes       | Only your own sharing  |
| `hasUnreadMessages`   | The meeting chat has unread messages                | Yes       | No                     |
| `isChatOpen`          | The meeting chat pane is open                       | No        | Yes                    |
| `isParticipantsOpen`  | The people pane is open                             | No        | Yes                    |
| `canToggleMute`       | You can mute or unmute                              | Yes       | Yes                    |
| `canToggleVideo`      | You can turn your camera on or off                  | Yes       | Yes                    |
| `canToggleHand`       | You can raise or lower your hand                    | Yes       | Yes                    |
| `canToggleBlur`       | Background blur can be toggled                      | Yes       | Yes                    |
| `canLeave`            | You can leave the meeting                           | Yes       | Yes                    |
| `canReact`            | You can send reactions                              | Yes       | Yes                    |
| `canToggleShareTray`  | You can open the share tray                         | Yes       | Yes                    |
| `canToggleChat`       | You can open the meeting chat                       | Yes       | Yes                    |
| `canStopSharing`      | You are sharing and can stop                        | Yes       | Yes                    |
| `canPair`             | A device can be paired (mainly on first connection) | Yes       | No                     |

### Known limitations

- Toggling background blur off sets **No background effect**, so a background image you had before blur is not restored.
- Teams API: toggling background blur does not make Teams send an update, so the blur feedback may not change straight away.
- Windows UI Automation: Teams only shows the background effect in the video options menu (the arrow next to the camera button). The blur feedback is read whenever that menu is open, including when you change blur there yourself. Changes made in the **More video effects** side panel show up the next time the menu opens.
