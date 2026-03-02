# Admin Analytics (Hub)

## Objectif
Analytics produit first-party (sans outil externe), stocké dans Supabase, consultable via `/admin/analytics`.

## Activation
Définir les variables d'environnement :

- `ANALYTICS_ENABLED=true` (activation globale)
- `ANALYTICS_IP_HASH_SALT=...` (recommandé, pour hasher l'IP)
- `NEXT_PUBLIC_ANALYTICS_CLICK_SAMPLE_RATE=0.5` (optionnel, sampling clicks)

## Sécurité
- La table `analytics_events` est protégée par RLS.
- Aucun accès direct client à la table.
- Écriture uniquement via `POST /api/analytics/track` côté serveur.
- Lecture admin uniquement via :
  - `/api/admin/analytics/summary`
  - `/api/admin/analytics/top`
  - `/api/admin/analytics/events`
- Accès admin strict : uniquement `client_id` `16` ou `18`.

## Événements trackés
- `session_start`, `session_end`
- `page_view`, `time_on_page`
- `click` (throttlé + sampling)
- `form_submit`
- `feature_used`
- `api_error`, `ui_error`

## Ajouter un event `feature_used`
Dans un composant client :

```tsx
import { trackFeatureUsed } from "@/lib/analytics/client";

function handleAction() {
  trackFeatureUsed("send_linkedin_message", {
    source: "prospection",
  });
}
```

## Wrappers disponibles
- `src/components/analytics/TrackedButton.tsx`
- `src/components/analytics/TrackedLink.tsx`

Exemple :

```tsx
<TrackedButton
  trackingId="export-selected"
  trackingLabel="Exporter sélection"
  trackingFeature="create_leads_export"
>
  Exporter
</TrackedButton>
```
