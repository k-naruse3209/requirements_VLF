# Turn-Taking Verification Checklist

This checklist confirms the "one user turn -> one assistant response" behavior.

## Preconditions
- ws-gateway running
- VoIP call connected and audio flowing

## Expected Logs (ws-gateway)
- `input_audio_buffer_commit_empty` does not appear
- `input_audio_buffer.committed` appears after the user stops speaking
- Only one `response.create` is logged per committed user turn
- No assistant response is triggered during silence

## Expected Behavior
- The assistant speaks once after each user turn
- The assistant does not keep talking when the user is silent
- Barge-in stops assistant speech (response.cancel sent on speech_started)

