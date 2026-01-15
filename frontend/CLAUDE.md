# Frontend Context

- **Tech**: React 19, Vite, TypeScript, Convex React, React Router
- **Purpose**: Chat UI with SSE streaming, artifact panel, and thread management

## Conventions

- **Single Source of Truth**: SSE stream drives UI during streaming, not Convex queries
- **Fire-and-Forget Persistence**: Convex mutations save data but don't affect UI state
- **Thread Loading**: `useQuery` loads history once per thread switch via `loadedThreadRef`
- **No Real-Time Sync During Streaming**: Prevents race conditions between SSE and Convex

## Key Files

- `src/App.tsx` — Main component: chat, streaming, artifact panel
- `src/App.css` — All styles including ThinkingBlock animations
- `src/main.tsx` — Entry point with Convex/Auth providers
- `src/lib/convex.ts` — Convex client configuration

## Where to Look

- For SSE event handling: see `handleSubmit()` and `handleApprove()` in App.tsx
- For ThinkingBlock UI: search for `ThinkingBlock` component
- For artifact rendering: search for `ArtifactCard` and `ArtifactPanel`
- For thread management: search for `handleSelectThread`, `handleNewThread`

## State Architecture

```
StreamState (during streaming)
├── startTime: number
├── activities: Activity[]     → ThinkingBlock
├── textContent: string        → Markdown render
└── artifact: Artifact | null  → ArtifactCard

Messages (after streaming)
├── role: 'user' | 'assistant'
└── parts: MessagePart[]
    ├── type: 'activity' (with duration)
    ├── type: 'text'
    └── type: 'artifact'
```

## SSE Event Mapping

| Server Event | Frontend Handler |
|--------------|------------------|
| `text` | Append to `streamState.textContent` |
| `tool` | Add to `streamState.activities` |
| `status` | Update step in activities |
| `artifact` | Set `streamState.artifact`, open panel |
| `done` | Calculate duration, finalize message |

## Adding New Event Types

1. Add case in `switch (eventType)` in `handleApprove()`
2. Add EventSource listener in `handleSubmit()`
3. Update `StreamState` interface if needed
4. Update `Activity` interface for new activity types

## ThinkingBlock Behavior

- **During streaming**: Shows cycling status with tool details
- **After completion**: Collapses to "Completed in Xs"
- **Expandable**: Click to see all activities
