# ThinkingCell Implementation Plan

## Overview

To properly implement the ThinkingCell component in the Cody Web interface, we need to implement a structured approach that follows the architecture of the existing codebase. This document outlines how to properly implement this feature.

## Components and Utilities Created

1. **Core Utilities**
   - `thinkContent.ts` - Extracts thinking content from messages
   - `useThinkingState.ts` - Hook to manage thinking state
   - `ThinkingCell.tsx` - UI component to display thinking content
   - `ThinkingDisplay.tsx` - Wrapper for ThinkingCell that determines when to show it
   - `useLocalStorage.ts` - Persistence hook for thinking state

2. **Tests**
   - `thinkContent.test.ts` - Tests for thinking content extraction
   - `useThinkingState.test.ts` - Tests for the thinking state hook

## Proper Implementation Steps

1. **Component Architecture Changes**

   - Modify `CodyWebChat.tsx`:
     ```typescript
     // Component state
     const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
     
     // Use thinking state hook
     const thinkingState = useThinkingState(messageInProgress)
     
     // Pass state to CodyWebPanel
     <CodyWebPanel
       thinkingState={thinkingState}
       // other props...
     />
     ```

   - In `CodyWebPanel.tsx`:
     ```typescript
     // Receive thinking state
     interface CodyWebPanelProps {
       // existing props
       thinkingState?: {
         thinkContent: string
         isThinking: boolean
         isThoughtProcessOpened: boolean
         setThoughtProcessOpened: (open: boolean) => void
       }
     }
     
     // Pass to Chat component
     <Chat
       thinkingState={thinkingState}
       // other props
     />
     ```

   - In the `Chat` component:
     ```typescript
     // Add ThinkingDisplay above Transcript
     {thinkingState && thinkingState.thinkContent && (
       <ThinkingDisplay
         thinkContent={thinkingState.thinkContent}
         isThinking={thinkingState.isThinking}
         isThoughtProcessOpened={thinkingState.isThoughtProcessOpened}
         setThoughtProcessOpened={thinkingState.setThoughtProcessOpened}
       />
     )}
     <Transcript />
     ```

2. **Testing Strategy**

   - Unit test each component in isolation
   - Integration tests for the complete feature
   - Manual testing with mock messages containing thinking content

## Next Steps

1. Fix references to messageInProgress in CodyWebChat
2. Implement the actual ThinkingState hook in CodyWebChat
3. Pass the thinking state to CodyWebPanel
4. Add ThinkingDisplay to the Chat component
5. Test the implementation