<p align="right"><strong>English</strong> · <a href="push.zh-CN.md">简体中文</a></p>

# Push (protocol version 1)

Wilco Host tells a device about a question waiting for an answer, or a run that finished or failed, with a notification, and keeps a session's Live Activity current. The Host seals each notification to the device; the push service ([`Push/`](../Push/)) passes it to Apple Push Notification service (APNs) and cannot read it.

## Sealed messages

A device makes a Curve25519 key pair for notifications and gives the Host its public key and push token. The Host seals each message with HPKE ([RFC 9180](https://www.rfc-editor.org/rfc/rfc9180), base mode): DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20-Poly1305, `info` = `"wilco-push-v1"`, empty associated data.

Sealed form: `[1 byte: version 1][32 bytes: encapsulated key][ciphertext]`, at most 2800 bytes. A device refuses another version.

The plaintext is a JSON object:

| Field | Type | Meaning |
|---|---|---|
| `kind` | `"approval"`, `"finished"` or `"failed"` | what happened |
| `hostID`, `hostName` | string | the Host |
| `workspaceID`, `workspaceName` | string | the folder |
| `sessionID` | string | the session |
| `sessionName` | string? | its name |
| `dialog` | object? | for `approval`: `{id, method, title, message?, shortened?}` of the waiting `extension_ui_request` |
| `detail` | string? | why the run failed, or the start of Pi's last answer; at most 300 characters |
| `steps` | integer? | tools Pi used in the run |
| `duration` | number? | seconds the run took |

Names (`hostName`, `workspaceName`, `sessionName`) are at most 100 characters. When a message would not fit, the Host shortens `detail`, then `dialog.message`, then `dialog.title`, ending each with "…"; a question cut short carries `dialog.shortened: true`, and a device offers no answer to it in the notification.

## Push service

`POST /v1/push` with a JSON body (at most 8 KB). Unknown fields are ignored.

An alert:

| Field | Meaning |
|---|---|
| `token` | the device's APNs token, 64–200 hex digits |
| `environment` | `"production"` or `"sandbox"` (development builds) |
| `kind` | `"alert"` |
| `category` | `"approval"`, `"finished"` or `"failed"` |
| `sealed` | the sealed message, base64 |
| `thread` | base64url, at most 64 characters: groups a session's notifications |
| `collapse` | optional, at most 64 characters: a newer notification with the same value replaces the older one |

APNs receives `{"aps":{"alert":{"loc-key":"PUSH_FALLBACK_<CATEGORY>"},"mutable-content":1,"sound":"default","category":"WILCO_<CATEGORY>","thread-id":…},"w":<sealed>}`, push type `alert`. The device's notification service extension opens `w` and writes the notification; the localized fallback is shown only if it cannot. A `finished` notification has no sound and priority 5; the others have priority 10.

A Live Activity update:

| Field | Meaning |
|---|---|
| `token`, `environment` | as above; the token is the Live Activity's push token |
| `kind` | `"activity"` |
| `event` | `"update"` or `"end"` |
| `state` | `{status, steps, startedAt, needsApproval, dialog?}`: `status` is `"working"`, `"needsYou"`, `"idle"` or `"failed"`; `steps` 0–100000; `startedAt` whole seconds since 2001-01-01 UTC (how ActivityKit reads dates); `dialog` is the waiting question's `id` (at most 64 characters), never its text |
| `staleAfter` | optional seconds (1–28800) after which the system shows the activity as out of date |
| `dismissAfter` | optional, only with `end`: seconds (0–14400) until the system removes the ended activity; 0 removes it at once |

APNs receives `{"aps":{"timestamp":…,"event":…,"content-state":<state>,"stale-date"?:…,"dismissal-date"?:…}}`, push type `liveactivity`, priority 10 while `needsApproval`, otherwise 5. The activity's content is not sealed, so it carries no text from the session: counts, times, and the question's id.

`needsApproval` is true only while the waiting question is a yes-or-no one (`method` `"confirm"`), and `dialog` is then its `id`. For any other question both are left out: the activity can only open the app.

## On the device

These are the rules the Wilco app follows; another client should follow them too.

- **Approving from a notification.** An `approval` notification offers Approve and Deny only when it shows the whole question: a `confirm` of at most 200 characters made of letters, numbers, punctuation, symbols and plain spaces. Line breaks, other invisible characters and combining marks are not allowed, so nothing can hide in what the person approves. For wilco-guard's questions the full command in `dialog.message` decides this, not the shortened title. Any other question opens the app. Both buttons need the device unlocked.
- **A message that cannot be opened.** If the device cannot open the sealed message (no key, or another version), it shows the push's fallback text with no buttons and nothing a tap acts on.
- **Live Activities.** The activity shows progress, the step count and the time since the run started, with the folder's and the Host's names. While `needsApproval` is true it offers Deny, which answers the question with `dialog` as its id, and a button that opens the question. It never offers Approve: it does not show the command.

Replies:

| Status | Meaning |
|---|---|
| `202` | APNs accepted it |
| `400` | the request is not valid: `{error}` |
| `410` | the token will never work again (`Unregistered`, `BadDeviceToken`, `DeviceTokenNotForTopic`): `{reason}`. The Host forgets it. |
| `413` | the body is larger than 8 KB |
| `429` | too many pushes: 30 a minute per token, 300 a minute per sender address |
| `502` | APNs refused or could not be reached: try later |
| `503` | the service is not configured |

The service keeps nothing. It rate-limits by a SHA-256 of the token, never the token itself.
