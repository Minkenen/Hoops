# Hoops Multiplayer Signaling

This document defines the small server layer used before the players connect directly to each other.

The multiplayer match itself should be peer-to-peer over WebRTC. The Worker only helps players find each other, exchange WebRTC offer/answer/ICE messages, track lobby readiness, and recover briefly from disconnects.

## Goals

- Quick match: put two waiting players into a lobby.
- Friend room: create a short room code and let another player join it.
- Lobby: keep both players in sync until they press Ready.
- WebRTC setup: relay SDP and ICE messages between the two players.
- Reconnect: keep a room alive briefly if one socket drops.

## Non-Goals

- Do not run match physics on the server.
- Do not stream live ball movement through the Worker once WebRTC is connected.
- Do not store match history in D1 for the first version.
- Do not support more than two players in one match.

## Transport

Use WebSocket for signaling:

```text
GET /mp/ws?mode=quick&game=speed
GET /mp/ws?mode=room&code=HK7-3QP
```

Create a friend room before opening the WebSocket:

```text
POST /mp/rooms
```

Response:

```json
{ "code": "HK7-3QP", "expiresIn": 600 }
```

The player must already be signed in. The existing session cookie/token identifies the player.

## Game IDs

```text
speed  First to 10, both players have their own ball
horse  Turn based HORSE
t21    Turn based 21
```

## Common Message Shape

Every WebSocket message is JSON:

```json
{
  "type": "message_type",
  "requestId": "optional-client-id",
  "payload": {}
}
```

Server errors use:

```json
{
  "type": "error",
  "requestId": "same-id-if-present",
  "payload": {
    "code": "room_not_found",
    "message": "Room not found. Check the code and try again."
  }
}
```

Client code should show `payload.message` as-is when it is meant for the UI.

## Server To Client Messages

### `room_created`

Sent after a friend-room socket is attached to a newly created room.

```json
{
  "type": "room_created",
  "payload": {
    "roomId": "opaque-room-id",
    "code": "HK7-3QP",
    "expiresAt": 1791795600000
  }
}
```

### `searching`

Sent while quick match is waiting.

```json
{
  "type": "searching",
  "payload": {
    "game": "speed",
    "estimatedSeconds": 20
  }
}
```

### `peer_found`

Sent when two players are paired. The `role` decides who creates the WebRTC offer.

```json
{
  "type": "peer_found",
  "payload": {
    "roomId": "opaque-room-id",
    "game": "speed",
    "role": "offerer",
    "you": {
      "id": "player-id",
      "nickname": "HoopsFan",
      "rank": 128,
      "ball": "you"
    },
    "peer": {
      "id": "player-id-2",
      "nickname": "Mia",
      "rank": 214,
      "ball": "opp"
    }
  }
}
```

Role values:

```text
offerer
answerer
```

### `lobby_state`

Sent whenever lobby state changes.

```json
{
  "type": "lobby_state",
  "payload": {
    "roomId": "opaque-room-id",
    "game": "speed",
    "court": "Street",
    "players": [
      { "id": "player-id", "nickname": "HoopsFan", "ready": true, "connected": true },
      { "id": "player-id-2", "nickname": "Mia", "ready": false, "connected": true }
    ]
  }
}
```

### `start_countdown`

Sent when both players are ready.

```json
{
  "type": "start_countdown",
  "payload": {
    "startsAt": 1791795003000,
    "seed": "match-seed",
    "countdownSeconds": 3
  }
}
```

The seed is shared so both clients can make matching cosmetic/random choices when needed.

### `signal`

Relays WebRTC data between peers.

```json
{
  "type": "signal",
  "payload": {
    "from": "player-id",
    "kind": "offer",
    "data": {}
  }
}
```

Kinds:

```text
offer
answer
ice
renegotiate
```

### `peer_disconnected`

Sent when a peer socket closes but the reconnect window is still open.

```json
{
  "type": "peer_disconnected",
  "payload": {
    "playerId": "player-id-2",
    "reconnectUntil": 1791795015000
  }
}
```

### `peer_reconnected`

Sent when the peer returns before the reconnect window ends.

```json
{
  "type": "peer_reconnected",
  "payload": {
    "playerId": "player-id-2"
  }
}
```

### `peer_left`

Sent when a player intentionally leaves.

```json
{
  "type": "peer_left",
  "payload": {
    "playerId": "player-id-2"
  }
}
```

## Client To Server Messages

### `set_game`

The host changes the lobby game before ready.

```json
{
  "type": "set_game",
  "requestId": "1",
  "payload": { "game": "horse" }
}
```

### `set_court`

The host changes the lobby court before ready.

```json
{
  "type": "set_court",
  "requestId": "2",
  "payload": { "court": "Gym" }
}
```

### `ready`

The player toggles Ready.

```json
{
  "type": "ready",
  "requestId": "3",
  "payload": { "ready": true }
}
```

### `signal`

Relay WebRTC data to the other player.

```json
{
  "type": "signal",
  "requestId": "4",
  "payload": {
    "kind": "offer",
    "data": {}
  }
}
```

### `leave`

The player leaves the room.

```json
{
  "type": "leave",
  "requestId": "5",
  "payload": {}
}
```

### `ping`

Optional latency/keepalive.

```json
{
  "type": "ping",
  "requestId": "6",
  "payload": { "clientTime": 1791795000000 }
}
```

Server replies:

```json
{
  "type": "pong",
  "requestId": "6",
  "payload": {
    "clientTime": 1791795000000,
    "serverTime": 1791795000032
  }
}
```

## Error Codes

```text
not_signed_in       Sign in before playing online.
bad_game            Unknown game id.
room_not_found      Room code does not exist.
room_full           Two players are already in the room.
room_expired        Room code expired.
already_ready       Game/court cannot change after ready.
not_host            Only the room host can change this setting.
bad_signal          WebRTC signal message was invalid.
rate_limited        Too many requests.
server_busy         Matchmaking is temporarily full.
```

## State Model

The server room state is intentionally small:

```ts
type RoomState = {
  id: string;
  code?: string;
  mode: "quick" | "friend";
  game: "speed" | "horse" | "t21";
  court: "Street" | "Gym" | "Arena";
  hostId: string;
  players: Record<string, {
    nickname: string;
    ready: boolean;
    connected: boolean;
    socket?: WebSocket;
    reconnectUntil?: number;
  }>;
  createdAt: number;
  expiresAt: number;
  startsAt?: number;
  seed?: string;
};
```

## First Implementation Plan

1. Add a Cloudflare Durable Object for multiplayer rooms and the quick-match queue.
2. Add `POST /mp/rooms`.
3. Add `GET /mp/ws`.
4. Wire the mock UI to a new client module, still behind `VITE_MULTIPLAYER_MOCK=1`.
5. Replace mock timers with real `searching`, `peer_found`, `lobby_state`, and `start_countdown`.
6. Add WebRTC offer/answer/ICE relay.
7. Send match messages over the WebRTC data channel.

## Data Channel Preview

After WebRTC connects, clients should use a data channel named:

```text
hoops-match-v1
```

The first match version can stay very small:

```json
{ "type": "hello", "payload": { "matchId": "opaque-room-id", "playerId": "player-id" } }
{ "type": "shot", "payload": { "shotId": "uuid", "x": 82, "y": 118, "vx": 5.4, "vy": -9.2, "t": 1791795003100 } }
{ "type": "score", "payload": { "shotId": "uuid", "made": true, "score": 1 } }
{ "type": "rematch", "payload": { "ready": true } }
```

Do not trust peer-reported scores for public leaderboards.
