## Microsoft Teams

Control the Microsoft Teams desktop app (Teams for work or school) from Companion, using Teams' third-party device API.

Teams Classic is no longer supported. If you used this module with Teams Classic, your buttons are upgraded automatically, but you need to pair again (see below).

### Setup

1. In Teams, open **Settings → Privacy**, scroll to the bottom, choose **Manage API** and turn the API on.
2. Add this module in Companion. Leave **API token** empty. If Teams runs on the same computer as Companion, keep the target IP at `127.0.0.1`.
3. Join a meeting in Teams and press any button that uses this module.
4. Teams asks whether to allow the device. Allow it, and the token is saved automatically.

Microsoft's guide: [Connect to third-party devices in Microsoft Teams](https://support.microsoft.com/en-us/office/connect-to-third-party-devices-in-microsoft-teams-aabca9f2-47bb-407f-9f9b-81a104a883d6)

### Actions

- Toggle mute
- Toggle video
- Toggle background blur
- Toggle raise hand
- Leave meeting
- Reaction (applause, laugh, like, heart, wow)

### Feedbacks and variables

Each of these is available as a boolean feedback and as a variable with the same id, for example `$(teams:isMuted)` when your connection is labelled `teams`.

| Id                    | Meaning                                             |
| --------------------- | --------------------------------------------------- |
| `isMuted`             | Your microphone is muted                            |
| `isVideoOn`           | Your camera is on                                   |
| `isHandRaised`        | Your hand is raised                                 |
| `isInMeeting`         | You are in a meeting                                |
| `isRecordingOn`       | The meeting is being recorded                       |
| `isBackgroundBlurred` | Background blur is on                               |
| `isSharing`           | Someone in the meeting is sharing                   |
| `hasUnreadMessages`   | The meeting chat has unread messages                |
| `canToggleMute`       | You can mute or unmute                              |
| `canToggleVideo`      | You can turn your camera on or off                  |
| `canToggleHand`       | You can raise or lower your hand                    |
| `canToggleBlur`       | Background blur can be toggled                      |
| `canLeave`            | You can leave the meeting                           |
| `canReact`            | You can send reactions                              |
| `canToggleShareTray`  | You can open the share tray                         |
| `canToggleChat`       | You can open the meeting chat                       |
| `canStopSharing`      | You are sharing and can stop                        |
| `canPair`             | A device can be paired (mainly on first connection) |

### Known limitations

- Toggling background blur does not make Teams send an update, so the blur feedback may not change straight away.
