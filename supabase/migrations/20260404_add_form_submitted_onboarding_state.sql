-- Add 'form_submitted' intermediate state to client_onboarding_state.
-- This state represents: LinkedIn connected + form submitted + video step (step 3) not yet completed.

alter table public.client_onboarding_state
  drop constraint if exists client_onboarding_state_state_check;

alter table public.client_onboarding_state
  add constraint client_onboarding_state_state_check
  check (state in ('created', 'linkedin_connected', 'form_submitted', 'completed'));
