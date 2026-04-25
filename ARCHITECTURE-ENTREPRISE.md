# Architecture — Lidmeo Entreprise (multi-comptes LinkedIn)

Date : 2026-04-23
Auteur : Lilian + Claude
Statut : figé (en attente d'exécution)

Ce document est la référence unique pour le chantier Entreprise. Il compile :
les décisions prises, le schéma DB cible, le modèle de permissions, les flows
clés, l'impact page par page, et le plan d'exécution en 4 phases avec briefs
Claude Code prêts à coller.

Il se lit dans l'ordre. Chaque section dépend de la précédente.

---

## 1. Contexte et principes directeurs

### 1.1 Rappel du besoin

Ajouter un abonnement Entreprise à Lidmeo qui permet :

- Plusieurs comptes LinkedIn connectés sur un même compte client payant
- Plusieurs utilisateurs Clerk (membres) rattachés à ce compte client
- Un admin organisation (≠ admin plateforme Lidmeo) qui supervise tout
- Chaque membre a sa propre configuration (compte LinkedIn, ICP, messages, leads)
- L'admin peut basculer en "vue de" chaque membre, agir en son nom, et broadcaster
  sa configuration vers un ou plusieurs membres

### 1.2 Principes non-négociables

1. **Zéro impact sur les clients solo actuels.** Essential et Full Auto solo
   gardent exactement le comportement qu'ils ont aujourd'hui. Tant qu'un client
   n'upgrade pas vers Entreprise, il ne voit aucune des nouvelles UI.
2. **Entreprise = Full Automatisé uniquement.** Pas d'Essential multi-compte.
   Le plan Entreprise débloque 15 invitations/jour × nombre de comptes LinkedIn.
3. **Isolation stricte au niveau membre.** Un membre lambda ne voit jamais les
   leads, l'inbox, ou la config des autres membres.
4. **L'admin voit tout.** Supervision totale : toutes les vues, toutes les
   inbox, capacité d'agir au nom de n'importe quel membre.
5. **Broadcast explicite.** Quand l'admin modifie une config (sa vue ou celle
   d'un membre), il choisit explicitement à qui propager. Jamais automatique.
6. **Refonte inbox en PR séparée** (Phase 4, post-Entreprise). On ship
   l'Entreprise avec l'inbox actuelle adaptée.

### 1.3 Architecture choisie

Option validée : `clients` reste l'entité physique pivot, on ajoute
`organization_members` par-dessus. Un "client" (au sens DB) peut désormais avoir
plusieurs utilisateurs Clerk rattachés via memberships.

Cela évite de renommer 191 `.eq('client_id', …)` dans 54 fichiers et limite le
blast radius. Le terme "organisation" devient un concept logique : un `clients`
en plan Entreprise EST une organisation.

---

## 2. Décisions figées (récapitulatif)

| Décision | Valeur |
|---|---|
| Entité pivot | `clients` (garde son nom physique) |
| Concept "organisation" | un `clients` avec `plan = 'enterprise'` |
| Auth | Clerk + Organizations activé en mode "Membership optional" |
| Plan Entreprise | 15 invitations/jour × nombre de comptes LinkedIn |
| Plan Entreprise limité à | Full Automatisé (pas d'Essential) |
| Isolation membre | chaque membre a son compte LI, ICP, messages, leads propres |
| Admin org | voit tout, peut agir au nom de chaque membre, peut broadcaster |
| Admin plateforme (Lidmeo) | distinct, gardé via flag DB (fin des allowlists hardcodées) |
| Membre qui part | admin réassigne ou supprime son compte LI |
| Invitation nouveau membre | email Clerk → onboarding simplifié → choix "copier config admin" ou "from scratch" |
| Propagation config admin → membres | action explicite (bouton "Appliquer à...") |
| Copie de config | copie réelle au moment T (pas de lien vivant) |
| Facturation Stripe | modèle à décider plus tard (n'impacte pas l'archi) |
| Refonte inbox | PR séparée post-Entreprise |
| Clients solo | aucun changement visible |

---

## 3. Schéma DB cible

Cette section décrit l'état DB cible après les 3 phases. Les migrations
incrémentales sont détaillées en §7.

### 3.1 Vue d'ensemble

```
clients (existe déjà)
  ├── platform_role (nouveau, remplace les allowlists)
  └── plan ∈ {'essential', 'full', 'enterprise'}

organization_members (nouveau)
  ├── client_id FK → clients.id
  ├── clerk_user_id (indexé)
  ├── role ∈ {'owner', 'admin', 'member'}
  └── UNIQUE (client_id, clerk_user_id)

organization_linkedin_accounts (nouveau)
  ├── client_id FK → clients.id
  ├── member_id FK → organization_members.id (owner du compte)
  ├── unipile_account_id UNIQUE
  └── UNIQUE (client_id, unipile_account_id)

Tables existantes enrichies
  ├── leads, inbox_threads, inbox_messages, linkedin_invitations,
  │   client_linkedin_settings, icp_configs, client_messages, etc.
  └── gagnent toutes un member_id FK → organization_members.id (nullable
      pour les clients solo, obligatoire pour Entreprise)
```

### 3.2 Table `clients` — évolution

Seules 2 colonnes ajoutées. Le reste ne bouge pas.

```sql
-- Migration : relâcher le CHECK plan
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_plan_check;
ALTER TABLE clients ADD CONSTRAINT clients_plan_check
  CHECK (plan IN ('essential', 'full', 'enterprise'));

-- Nouveau : flag admin plateforme (remplace les allowlists)
ALTER TABLE clients ADD COLUMN platform_role text NULL
  CHECK (platform_role IS NULL OR platform_role IN (
    'platform_admin',      -- support + admin (remplace SUPPORT_ADMIN_CLIENT_IDS)
    'analytics_admin',     -- + analytics globales (remplace ANALYTICS_ADMIN_CLIENT_IDS)
    'playbook_access'      -- accès playbook commercial (remplace PLAYBOOK_ALLOWED_CLIENT_IDS)
  ));

-- Backfill depuis les allowlists actuelles
UPDATE clients SET platform_role = 'analytics_admin' WHERE id IN (16, 18);
UPDATE clients SET platform_role = 'platform_admin' WHERE id = 24;
-- Note: [16, 18] auront analytics_admin qui débloque aussi platform_admin par hiérarchie
-- (voir §4.2 pour la hiérarchie de rôles)
-- Pour playbook : on utilisera un flag séparé car c'est du commercial
ALTER TABLE clients ADD COLUMN playbook_enabled boolean NOT NULL DEFAULT false;
UPDATE clients SET playbook_enabled = true WHERE id IN (16, 18, 70, 74);
```

### 3.3 Table `organization_members` (nouvelle)

```sql
CREATE TABLE organization_members (
  id bigserial PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),

  -- Metadata
  invited_at timestamptz NOT NULL DEFAULT now(),
  invited_by_member_id bigint NULL REFERENCES organization_members(id),
  joined_at timestamptz NULL,
  removed_at timestamptz NULL,
  display_name text NULL,        -- cache affichage, sync depuis Clerk
  email text NULL,                -- cache affichage, sync depuis Clerk
  avatar_url text NULL,           -- cache affichage, sync depuis Clerk

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (client_id, clerk_user_id),
  -- Seul un owner par client (business rule)
  EXCLUDE (client_id WITH =) WHERE (role = 'owner' AND removed_at IS NULL)
);

CREATE INDEX idx_org_members_clerk_user ON organization_members(clerk_user_id)
  WHERE removed_at IS NULL;
CREATE INDEX idx_org_members_client ON organization_members(client_id)
  WHERE removed_at IS NULL;

-- Trigger updated_at
CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
```

**Règles métier :**
- Un `clients` a exactement **1 owner** actif (le créateur, celui qui paie).
- Un `clients` a 0..N `admin` et 0..N `member`.
- Un `clerk_user_id` peut appartenir à plusieurs `clients` (rare mais possible).
- `removed_at` : soft delete. On garde l'historique des invitations/départs.

### 3.4 Table `organization_linkedin_accounts` (nouvelle)

Cette table remplace progressivement `unipile_accounts` et
`client_linkedin_settings` comme source de vérité côté Entreprise. Pour les
clients solo, on garde la compat.

```sql
CREATE TABLE organization_linkedin_accounts (
  id bigserial PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  member_id bigint NOT NULL REFERENCES organization_members(id) ON DELETE RESTRICT,

  -- Unipile
  unipile_account_id text NOT NULL,
  provider text NOT NULL DEFAULT 'linkedin' CHECK (provider = 'linkedin'),
  status text NOT NULL DEFAULT 'connected',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz NULL,

  -- Automation settings (ex-client_linkedin_settings)
  enabled boolean NOT NULL DEFAULT false,
  daily_invite_quota int NOT NULL DEFAULT 15
    CHECK (daily_invite_quota IN (10, 15, 20, 30)),
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '18:00',

  -- Metadata
  display_label text NULL,  -- "Compte LinkedIn de Jean", éditable par l'admin
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL,

  UNIQUE (unipile_account_id),                   -- un compte LI ne peut être sur 2 orgs
  UNIQUE (client_id, unipile_account_id)         -- dédoublonnage intra-org
);

CREATE INDEX idx_org_li_accounts_client ON organization_linkedin_accounts(client_id)
  WHERE removed_at IS NULL;
CREATE INDEX idx_org_li_accounts_member ON organization_linkedin_accounts(member_id)
  WHERE removed_at IS NULL;

CREATE TRIGGER trg_org_li_accounts_updated_at
  BEFORE UPDATE ON organization_linkedin_accounts
  FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

-- Publication realtime (sidebar, settings)
ALTER PUBLICATION supabase_realtime ADD TABLE organization_linkedin_accounts;
```

**Règles métier :**
- Un compte LinkedIn appartient à **1** membre (`member_id`).
- Quand un membre est supprimé : ses comptes LI passent en `removed_at` ou sont
  réassignés par l'admin (Phase 3, UI dédiée).
- Pour les clients solo (plan essential/full), on backfill 1 ligne par
  `unipile_account` existant, avec `member_id` = le membre owner auto-créé.

### 3.5 Tables scopées — ajout de `member_id`

Toutes les tables qui stockent des données métier scopées utilisateur gagnent
un `member_id` FK nullable. Nullable car pendant la migration, puis
back-fillé, puis rendu NOT NULL en fin de Phase 2.

Tables concernées :

| Table | Colonne ajoutée | Règle |
|---|---|---|
| `leads` | `member_id` | Le lead appartient au membre qui l'a reçu/prospecte |
| `map_leads` | `member_id` | idem |
| `inbox_threads` | `member_id` | Dérivé du `unipile_account_id` |
| `inbox_messages` | `member_id` | idem |
| `linkedin_invitations` | `member_id` | Expéditeur |
| `automation_logs` | `member_id` | Action exécutée par ce compte |
| `icp_configs` | `member_id` | Chaque membre a son ICP |
| `search_credits` | `member_id` | 5 crédits par membre, pas par org |
| `search_logs` | `member_id` | |
| `extraction_logs` | `member_id` | |
| `client_messages` | `member_id` | Chaque membre a ses templates |
| `client_activity_logs` | `member_id` | idem |
| `email_log` | `member_id` | |
| `client_onboarding_state` | `member_id` | Chaque membre a son onboarding |
| `client_events` | `member_id` | |
| `analytics_events` | `member_id` | |

**Back-fill strategy :** pour chaque row existante, `member_id` = l'`id` du
membre owner auto-créé pour ce `client_id` (voir Phase 1 §7.2).

**Dépréciation :** `client_linkedin_settings` devient redondant avec
`organization_linkedin_accounts`. On le garde en lecture pendant la Phase 2
pour compat, puis on le supprime en fin de Phase 2 après migration complète
du code.

### 3.6 RLS — évolution du pattern

Pattern actuel (majoritaire) :
```sql
USING (
  client_id IN (
    SELECT id FROM clients WHERE clerk_user_id = auth.jwt() ->> 'sub'
  )
)
```

Pattern cible :
```sql
USING (
  client_id IN (
    SELECT om.client_id FROM organization_members om
    WHERE om.clerk_user_id = auth.jwt() ->> 'sub'
      AND om.removed_at IS NULL
  )
  AND (
    -- Admin ou owner : voit tout dans son org
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.client_id = {table}.client_id
        AND om.clerk_user_id = auth.jwt() ->> 'sub'
        AND om.role IN ('owner', 'admin')
        AND om.removed_at IS NULL
    )
    OR
    -- Member : voit uniquement ses propres rows
    {table}.member_id IN (
      SELECT om.id FROM organization_members om
      WHERE om.clerk_user_id = auth.jwt() ->> 'sub'
        AND om.client_id = {table}.client_id
        AND om.removed_at IS NULL
    )
  )
)
```

**Helper Postgres pour factoriser :**

```sql
CREATE OR REPLACE FUNCTION current_member_ids_for_client(p_client_id bigint)
RETURNS TABLE(member_id bigint, role text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT om.id, om.role
  FROM organization_members om
  WHERE om.client_id = p_client_id
    AND om.clerk_user_id = auth.jwt() ->> 'sub'
    AND om.removed_at IS NULL
$$;

CREATE OR REPLACE FUNCTION current_user_can_see_row(
  p_client_id bigint,
  p_member_id bigint
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.client_id = p_client_id
      AND om.clerk_user_id = auth.jwt() ->> 'sub'
      AND om.removed_at IS NULL
      AND (
        om.role IN ('owner', 'admin')
        OR om.id = p_member_id
      )
  )
$$;
```

Les policies deviennent alors :
```sql
CREATE POLICY leads_select ON leads FOR SELECT
  USING (current_user_can_see_row(client_id, member_id));
```

**Impact sur les clients solo :** ils ont 1 seul membre owner, donc
`role = 'owner'` → voit tout, comme aujourd'hui.

---

## 4. Modèle de permissions

### 4.1 Les 3 rôles organisation

| Rôle | Description | Droits |
|---|---|---|
| `owner` | Créateur du compte Entreprise, celui qui paie | Tout `admin` + gestion facturation + suppression de l'organisation |
| `admin` | Délégué par l'owner pour gérer l'équipe | Invite/supprime membres, réassigne comptes LI, supervise tous les scopes, broadcast config |
| `member` | Utilisateur standard | Voit et édite uniquement son propre scope (compte LI, leads, ICP, messages, inbox, followups) |

**Unicité de l'owner :** exactement 1 owner actif par organisation (contrainte
EXCLUDE en DB). Transfert d'ownership possible via une action dédiée
(owner → admin, admin → owner). Hors scope Phase 1-3, à voir plus tard.

### 4.2 Hiérarchie et platform_role

Indépendamment du rôle organisation, un utilisateur peut avoir un
`platform_role` sur sa row `clients` (au sens Lidmeo plateforme).

```
platform_role hiérarchie :
  NULL < playbook_enabled < platform_admin < analytics_admin

platform_admin  → accès /admin/clients, /admin/support, toutes les routes /api/admin/*
analytics_admin → platform_admin + /admin/analytics
playbook_enabled → accès /playbook (flag booléen séparé, non hiérarchique)
```

Ces deux dimensions sont **indépendantes** :
- Lilian a `platform_role = 'analytics_admin'` (voit tous les clients Lidmeo)
  ET il est `owner` de son org Lidmeo perso si il en a une
- Un client lambda a `platform_role = NULL` mais peut être `owner` ou `admin`
  de son organisation

### 4.3 Matrice d'accès (simplifiée)

| Action | Solo | Member | Admin org | Owner org | Platform admin |
|---|---|---|---|---|---|
| Voir ses propres leads | ✅ | ✅ | ✅ | ✅ | ✅ (en mode debug) |
| Voir leads d'un autre membre | — | ❌ | ✅ | ✅ | ✅ |
| Connecter son compte LI | ✅ | ✅ | ✅ | ✅ | — |
| Déconnecter le compte LI d'un autre | — | ❌ | ✅ | ✅ | — |
| Éditer son ICP | ✅ | ✅ | ✅ | ✅ | — |
| Éditer l'ICP d'un autre membre | — | ❌ | ✅ | ✅ | ✅ (debug) |
| Broadcast ICP/messages vers N membres | — | ❌ | ✅ | ✅ | — |
| Inviter un nouveau membre | — | ❌ | ✅ | ✅ | — |
| Supprimer un membre | — | ❌ | ✅ | ✅ | — |
| Gérer la facturation Stripe | ✅ | ❌ | ❌ | ✅ | — |
| Upgrader vers Entreprise | ✅ | — | — | — | — |
| Panel admin Lidmeo (`/admin`) | — | — | — | — | ✅ |
| Support widget (chat client) | ✅ | ✅ | ✅ | ✅ | — |

### 4.4 Renommage des "admins plateforme" dans le code

Avant :
```ts
const SUPPORT_ADMIN_CLIENT_IDS = [16, 18, 24];
export function isSupportAdmin(clientId: number) {
  return SUPPORT_ADMIN_CLIENT_IDS.includes(clientId);
}
```

Après :
```ts
// lib/platform-auth.ts
export async function getPlatformRole(clientId: number): Promise<PlatformRole | null> {
  const { data } = await supabaseAdmin
    .from('clients')
    .select('platform_role')
    .eq('id', clientId)
    .single();
  return data?.platform_role ?? null;
}

export function hasPlatformAdminAccess(role: PlatformRole | null): boolean {
  return role === 'platform_admin' || role === 'analytics_admin';
}

export function hasAnalyticsAdminAccess(role: PlatformRole | null): boolean {
  return role === 'analytics_admin';
}
```

Et `getSupportAdminContext` devient `getPlatformAdminContext`.

---

## 5. Flows clés

### 5.1 Upgrade solo → Entreprise

**Contexte :** un client existant en plan `full` (solo) veut passer Entreprise
pour inviter ses collaborateurs.

**Flow :**

1. Client clique "Upgrader vers Entreprise" sur `/dashboard/hub/billing`.
2. Front redirige vers Stripe Checkout avec `priceId = STRIPE_PRICE_ENTERPRISE`
   et metadata `{ client_id, clerk_user_id, upgrade_from: 'full' }`.
3. Stripe webhook `customer.subscription.updated` reçu par `/api/stripe/webhook` :
   - UPDATE `clients.plan = 'enterprise'`
   - UPDATE `clients.subscription_status = 'active'`
   - UPDATE `clients.quota` selon le `priceId` (ex: base 15 par compte LI)
4. **Backfill membership** (déclenché par un trigger Supabase OU par le webhook) :
   - Check si row `organization_members` existe pour ce `client_id`
   - Si oui (cas théorique où Phase 1 est déjà passée) : UPDATE `role = 'owner'`
   - Si non : INSERT `{ client_id, clerk_user_id, role: 'owner' }`
5. **Backfill `organization_linkedin_accounts`** :
   - INSERT depuis `unipile_accounts` (et `client_linkedin_settings` pour les
     settings) → 1 ligne par compte existant, `member_id` = le owner
6. **Backfill `member_id`** sur toutes les tables scopées : UPDATE WHERE
   `client_id = ?` AND `member_id IS NULL` → `member_id = <owner_id>`
7. Client redirigé vers `/dashboard/org/members` : nouvelle page, présentation
   "Votre organisation est prête, invitez vos premiers membres".

**Point d'attention :** les étapes 4-6 doivent être **idempotentes** (si le
webhook Stripe est rejoué, pas de double-création). On utilise
`ON CONFLICT DO NOTHING` partout.

### 5.2 Invitation d'un nouveau membre

**Contexte :** admin org invite Jean (jean@entreprise.com).

**Flow :**

1. Admin sur `/dashboard/org/members` → "Inviter un membre" → saisit email.
2. Check nombre de sièges payés :
   ```sql
   SELECT COUNT(*) FROM organization_members
   WHERE client_id = ? AND removed_at IS NULL
   ```
   vs quota d'Entreprise (à définir selon modèle Stripe).
3. Si OK, appel Clerk API `clerkClient.organizations.createOrganizationInvitation`
   avec `emailAddress`, `role: 'basic_member'`, publicMetadata `{ client_id, role: 'member' }`.
4. INSERT `organization_members` avec `role = 'member'`, `joined_at = NULL`,
   `invited_by_member_id = <admin_member_id>`.
5. Clerk envoie email d'invitation (template custom Lidmeo).
6. Jean clique, crée son compte Clerk, rejoint l'org.
7. Webhook Clerk `organizationMembership.created` → UPDATE
   `organization_members.joined_at = now()`, UPDATE `clerk_user_id` si besoin
   (au cas où Jean change d'identifiant).
8. **Onboarding simplifié** (nouvelle route `/onboarding/member`) :
   - Étape 1 : "Bienvenue chez [NomOrg]. Connectez votre compte LinkedIn"
     (wizard Unipile standard, avec `name = <member_id>` et pas `<client_id>`)
   - Étape 2 : "Configurez votre ciblage ICP" avec **3 options affichées** :
     - "Reprendre la configuration de [NomAdmin]" (copie ICP + messages)
     - "Reprendre la configuration de [AutreMembre]" (si plusieurs admins/membres existent)
     - "Configurer from scratch" (wizard ICP + messages comme un solo)
   - Étape 3 : vidéo de présentation (comme solo)
9. Jean atterrit sur `/dashboard/leads` avec son scope propre.

**Copie de config (option "Reprendre de...") :**

```sql
-- Copie de l'ICP
INSERT INTO icp_configs (client_id, member_id, filters, state, ...)
SELECT client_id, <new_member_id>, filters, 'active', ...
FROM icp_configs
WHERE client_id = ? AND member_id = <source_member_id> AND state = 'active';

-- Copie des messages
INSERT INTO client_messages (client_id, member_id, message_linkedin, relance_linkedin,
  message_email, system_prompt, status, mode)
SELECT client_id, <new_member_id>, message_linkedin, relance_linkedin,
  message_email, system_prompt, 'active', mode
FROM client_messages
WHERE client_id = ? AND member_id = <source_member_id>;
```

### 5.3 Broadcast de config (admin → membres)

**Contexte :** admin a modifié son ICP (ou celui d'un membre) et veut le
propager à d'autres membres.

**Flow UI :**

1. Admin sur `/dashboard/hub/icp-builder` (sa vue ou vue d'un membre) → édite
   l'ICP → sauvegarde.
2. Toast de succès affiche un bouton secondaire : **"Appliquer cette config à
   d'autres membres"**.
3. Si cliqué : modale avec :
   - Liste des membres de l'org (checkboxes), exclut le membre source
   - Radio "ICP seul" / "Messages seuls" / "ICP + Messages"
   - Warning : "Cela écrasera la configuration actuelle des membres sélectionnés.
     Une sauvegarde est conservée."
   - Bouton "Appliquer à X membre(s)"
4. POST `/api/org/broadcast-config` avec `{ source_member_id, target_member_ids,
   scope: ['icp' | 'messages' | 'both'] }`.
5. Backend :
   - Check admin/owner role
   - Pour chaque target :
     - Snapshot de la config actuelle dans une table `config_snapshots`
       (audit + rollback potentiel)
     - UPDATE/INSERT `icp_configs` et/ou `client_messages` avec la source
6. Response : nombre de membres mis à jour.
7. Toast : "Config appliquée à X membres. Ils en seront notifiés au prochain login."

**Table audit (optionnelle mais recommandée) :**

```sql
CREATE TABLE org_config_broadcasts (
  id bigserial PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES clients(id),
  source_member_id bigint NOT NULL REFERENCES organization_members(id),
  target_member_ids bigint[] NOT NULL,
  scope text[] NOT NULL,  -- ['icp', 'messages']
  snapshot jsonb NOT NULL,  -- ancien état des targets, pour rollback
  executed_by_member_id bigint NOT NULL REFERENCES organization_members(id),
  executed_at timestamptz NOT NULL DEFAULT now()
);
```

### 5.4 Switch de vue admin ("vue en tant que")

**Contexte :** admin veut voir ce que voit Jean, ou agir en son nom.

**Implémentation côté UI :**

- Composant `<OrgViewSwitcher>` monté dans la Sidebar (uniquement visible si
  `role IN ('owner', 'admin')`).
- Dropdown affichant :
  - "Vue organisation" (agrégée, dashboards globaux)
  - "Ma vue" (l'admin comme membre standard)
  - Pour chaque membre actif : "Vue de [NomMembre]"
- Sélection → stockée dans un cookie `lidmeo_view_as_member_id` (server-side
  readable) OU dans React Context avec URL query param `?as=<member_id>`.

**Implémentation côté backend :**

- Nouveau helper `getEffectiveMemberId(request)` :
  ```ts
  export async function getEffectiveMemberId(req: NextRequest): Promise<number> {
    const { userId } = auth();
    const { clientId, role, selfMemberId } = await getOrgContext(userId);
    const asParam = req.nextUrl.searchParams.get('as')
                 ?? req.cookies.get('lidmeo_view_as_member_id')?.value;

    if (!asParam) return selfMemberId;
    const asId = parseInt(asParam, 10);

    // Seuls admin/owner peuvent imposer un member_id différent du leur
    if (role === 'admin' || role === 'owner') {
      // Vérifier que asId appartient bien à clientId
      const valid = await isMemberOfClient(asId, clientId);
      if (valid) return asId;
    }
    return selfMemberId;
  }
  ```
- Toutes les routes API qui aujourd'hui font `.eq('client_id', clientId)`
  ajoutent `.eq('member_id', effectiveMemberId)` **sauf** pour la vue agrégée
  (`as=__org__`) qui ne filtre que par `client_id`.

**Audit :** toute action admin en "vue de X" est loggée dans
`client_activity_logs` avec `actor_member_id = <admin_id>` et
`on_behalf_of_member_id = <target_id>`. Prévoir d'ajouter ces 2 colonnes.

### 5.5 Suppression / réassignement d'un membre

**Contexte :** Jean quitte l'entreprise, l'admin veut soit supprimer ses données
soit les réattribuer.

**Flow :**

1. Admin sur `/dashboard/org/members` → ligne Jean → menu "..." → "Supprimer le membre".
2. Modale : "Que faire de ses données ?" avec 3 options :
   - **Réassigner à un autre membre** (dropdown) : tous les `leads`,
     `inbox_threads`, `icp_configs`, `client_messages` avec `member_id = Jean`
     → `member_id = <target>`. Le compte LI Unipile est réassigné via
     `organization_linkedin_accounts.member_id = <target>`.
   - **Supprimer les données** : soft-delete des rows métier (flag `deleted_at`
     à ajouter le cas échéant), déconnexion du compte LI Unipile (appel API
     Unipile), suppression de la row `organization_linkedin_accounts`.
   - **Conserver en lecture seule** (option simple) : `removed_at = now()` sur
     `organization_members`, les données restent, plus personne ne les voit
     (membre effacé), mais l'admin peut réactiver plus tard.
3. Soft-delete de la row Clerk Organization membership (révoque l'accès).

### 5.6 Déconnexion / suppression d'un compte LinkedIn

**Contexte :** admin veut retirer un compte LI connecté (le membre change de
compte perso, ou départ).

1. Admin sur `/dashboard/org/linkedin-accounts` → ligne du compte → "Déconnecter".
2. Confirmation : "Cela arrêtera toute automation sur ce compte. Les données
   (leads, inbox) seront conservées mais ne recevront plus de nouvelles
   interactions."
3. POST `/api/org/linkedin-accounts/[id]/disconnect` :
   - Appel Unipile API DELETE `/accounts/{unipile_account_id}`
   - UPDATE `organization_linkedin_accounts.status = 'disconnected'`,
     `removed_at = now()`, `enabled = false`
   - Les crons (linkedin-cron-runner, followup-cron-runner) filtrent déjà sur
     `enabled = true AND removed_at IS NULL`

---

## 6. Impact page par page

Cette section liste chaque page et API route existante, et ce qui change (ou
pas) avec l'Entreprise.

### 6.1 Pages publiques — aucun changement

`/`, `/sign-in`, `/sign-up`, `/playbook` : 0 changement (sauf `/playbook` dont
l'allowlist est migrée en flag DB).

### 6.2 Onboarding

| Route | Solo | Entreprise (nouveau membre) |
|---|---|---|
| `/onboarding` | ✅ inchangé | Redirigé vers `/onboarding/member` si `client_id` a `plan = 'enterprise'` et user est nouveau membre |
| `/onboarding/form` | ✅ inchangé | Non utilisé |
| `/onboarding/video` | ✅ inchangé | Étape 3 du flow membre, réutilisé |
| `/onboarding/member` | — | **Nouveau** : Unipile → ICP (avec choix copie/from scratch) → video |

### 6.3 Dashboard client

| Route | Solo | Entreprise (member) | Entreprise (admin/owner) |
|---|---|---|---|
| `/dashboard` | ✅ stats perso | Stats perso (scope `member_id = self`) | Vue au choix : org-aggregated ou `as=<member_id>` |
| `/dashboard/leads` | ✅ | Leads perso | Tous les leads si vue org, ou leads de X si `as=X` |
| `/dashboard/inbox` | ✅ | Threads perso | Tous les threads + tabs "Mon inbox" / "Inbox de Jean" (cf Phase 4 refonte) |
| `/dashboard/followups` | ✅ | Followups perso | idem |
| `/dashboard/automation` | ✅ | Feed perso (son compte LI) | Feed agrégé ou par compte |
| `/dashboard/hub/billing` | ✅ | Masqué (pas de billing pour member) | Visible owner uniquement |
| `/dashboard/hub/icp-builder` | ✅ | Son ICP | Son ICP + bouton "Broadcast" |
| `/dashboard/hub/messages-setup` | ✅ | Ses messages | Ses messages + bouton "Broadcast" |
| `/dashboard/support` | ✅ | Son support | Son support (chat perso) |
| `/settings/linkedin` | ✅ | Son compte LI | Son compte + liste des comptes de l'org (nouveau `/dashboard/org/linkedin-accounts`) |

### 6.4 Nouvelles pages Entreprise

| Route | Visible par | Contenu |
|---|---|---|
| `/dashboard/org` | admin/owner | Landing de gestion org : stats équipe, raccourcis |
| `/dashboard/org/members` | admin/owner | Liste membres : avatar, email, compte LI connecté, dernière activité, menu actions (inviter, supprimer, promouvoir admin) |
| `/dashboard/org/members/invite` | admin/owner | Formulaire invitation (email + option pré-copie de config) |
| `/dashboard/org/linkedin-accounts` | admin/owner | Liste des comptes LI : status, quota, stats 7j, owner, actions (déconnecter, réassigner) |
| `/dashboard/org/settings` | owner | Nom de l'org, logo, préférences équipe |

### 6.5 Admin plateforme Lidmeo — impact limité

Les pages `/admin/*` ne changent pas dans leur logique fonctionnelle. Ce qui
change :

- Résolution du rôle : `getSupportAdminContext` → `getPlatformAdminContext`
  (lit `clients.platform_role` au lieu de l'allowlist hardcodée).
- Affichage client : `/admin/clients/[id]` affiche désormais la liste des
  membres de l'org si `plan = 'enterprise'` (nouvelle section). Permet à
  l'admin plateforme de debug en cas de support.

### 6.6 API routes — 3 catégories

**Catégorie A : Zéro changement de signature, ajout de filtre `member_id` en interne.**

Exemples : `/api/dashboard/stats`, `/api/leads/*`, `/api/inbox/*`,
`/api/followups/*`, `/api/icp/*`, `/api/messages/*`.

Pattern : résoudre `effectiveMemberId` via `getEffectiveMemberId(req)`, puis
ajouter `.eq('member_id', effectiveMemberId)` dans les queries Supabase.

**Catégorie B : Impact sur les crons / webhooks (Phase 2 critique).**

- `linkedin-cron-runner` (edge function) : itère sur
  `organization_linkedin_accounts` au lieu de `client_linkedin_settings`.
- `followup-cron-runner` : idem.
- `api/unipile/webhook/route.ts` :
  - `autoMarkLeadResponded` : résout le `member_id` depuis l'`unipile_account_id`
    et match sur `leads.member_id` en plus du `leads.client_id`.
  - `handleNewRelation` : idem pour `linkedin_invitations.member_id`.
  - `findLeadIdByLinkedInIdentity` : ajoute un filtre `member_id` si dispo.
- `api/unipile/notify` : insère dans `organization_linkedin_accounts`, pas
  dans `unipile_accounts` + `client_linkedin_settings`.

**Catégorie C : Nouvelles routes Entreprise.**

| Route | Méthode | Role | Rôle |
|---|---|---|---|
| `/api/org/members` | GET | admin/owner | Liste membres |
| `/api/org/members` | POST | admin/owner | Inviter (avec Clerk API) |
| `/api/org/members/[id]` | DELETE | admin/owner | Supprimer/désactiver |
| `/api/org/members/[id]/promote` | POST | owner | Passer member → admin |
| `/api/org/linkedin-accounts` | GET | admin/owner | Liste comptes LI de l'org |
| `/api/org/linkedin-accounts/[id]` | DELETE | admin/owner | Déconnecter |
| `/api/org/linkedin-accounts/[id]/reassign` | POST | admin/owner | Réassigner à autre membre |
| `/api/org/broadcast-config` | POST | admin/owner | Broadcast ICP/messages |
| `/api/org/view-as` | POST | admin/owner | Set cookie/session `view_as_member_id` |
| `/api/webhooks/clerk-org` | POST | public (secret) | Clerk Organizations webhook |

---

## 7. Plan d'exécution — 4 phases

Les phases doivent être exécutées **strictement dans l'ordre**. Chaque phase
est indépendamment shippable en production. À la fin de chaque phase, l'app
tourne normalement, les clients solo continuent à fonctionner.

### 7.1 Phase 0 — Nettoyage préalable (1-2 jours)

**Objectif :** supprimer les dettes qui vont gêner la refacto multi-tenant.

**Scope :**

1. **Supprimer les doublons OneDrive** : tous les fichiers finissant par
   ` 2.ts`, ` 2.tsx`, ` 2.sql`. Git, commit, fini.
2. **Migration allowlists → flag DB** :
   - Créer migration `20260424_platform_role_and_playbook.sql` (cf. §3.2)
   - Backfill depuis les constantes `SUPPORT_ADMIN_CLIENT_IDS`,
     `ANALYTICS_ADMIN_CLIENT_IDS`, `PLAYBOOK_ALLOWED_CLIENT_IDS`, `TEST_ORG_IDS`
3. **Refactor `lib/support-admin-auth.ts`** → `lib/platform-auth.ts` :
   - Lit `clients.platform_role` et `clients.playbook_enabled` au lieu des constantes
   - Garde la même API publique (`getPlatformAdminContext()`, etc.)
   - Supprime le fallback `publicMetadata.client_id` (force la résolution par
     `clerk_user_id` uniquement)
4. **Mise à jour des call-sites** : chercher `SUPPORT_ADMIN_CLIENT_IDS`,
   `ANALYTICS_ADMIN_CLIENT_IDS`, `PLAYBOOK_ALLOWED_CLIENT_IDS`, `TEST_ORG_IDS`,
   `isSupportAdmin`, `isAnalyticsAdmin` → remplacer par les nouveaux helpers.
5. **Tests de non-régression manuels** : login avec un compte admin (id 24),
   analytics admin (id 16/18), client lambda → vérifier que les accès sont
   identiques.

**Brief Claude Code Phase 0 :**

```
Objectif : nettoyer le code avant le chantier Entreprise.

ÉTAPE 1 — Supprimer les doublons OneDrive
Liste tous les fichiers qui matchent "* 2.ts", "* 2.tsx", "* 2.sql" dans le
repo. Pour chaque, vérifie avec git log qu'il n'est importé nulle part, puis
supprime-les. Commit : "chore: remove OneDrive sync duplicates".

ÉTAPE 2 — Migration platform_role
Crée supabase/migrations/20260424_platform_role_and_playbook.sql :
- ALTER TABLE clients ADD COLUMN platform_role text NULL
- ALTER TABLE clients ADD COLUMN playbook_enabled boolean NOT NULL DEFAULT false
- CHECK constraint sur platform_role IN ('platform_admin', 'analytics_admin')
- Backfill : UPDATE clients SET platform_role = 'analytics_admin' WHERE id IN (16, 18)
- Backfill : UPDATE clients SET platform_role = 'platform_admin' WHERE id = 24
- Backfill : UPDATE clients SET playbook_enabled = true WHERE id IN (16, 18, 70, 74)
- Backfill : UPDATE clients SET is_test = true WHERE id IN (16, 18) -- déjà existant, idempotent

ÉTAPE 3 — Refactor lib/platform-auth.ts
Crée src/lib/platform-auth.ts qui remplace src/lib/support-admin-auth.ts :
- Lit platform_role depuis la DB au lieu des constantes
- Garde la même API : getPlatformAdminContext(), getAnalyticsAdminContext(),
  hasPlatformAdminAccess(), hasAnalyticsAdminAccess()
- Hiérarchie : analytics_admin inclut platform_admin
- Supprime le fallback publicMetadata.client_id dans resolveClientIdForClerkUserId
- Ajoute un cache mémoire court (5 min) pour éviter de re-query à chaque route

ÉTAPE 4 — Mise à jour des call-sites
Recherche et remplace dans tout src/ :
- `SUPPORT_ADMIN_CLIENT_IDS.includes(...)` → `hasPlatformAdminAccess(role)`
- `ANALYTICS_ADMIN_CLIENT_IDS.includes(...)` → `hasAnalyticsAdminAccess(role)`
- `PLAYBOOK_ALLOWED_CLIENT_IDS.includes(...)` → `clients.playbook_enabled` query
- `TEST_ORG_IDS.includes(...)` → `clients.is_test` query
- `import { ... } from '@/lib/support-admin-auth'` → `from '@/lib/platform-auth'`

Supprime lib/support-admin-auth.ts une fois tous les imports migrés.

ÉTAPE 5 — Sidebar et routes /admin
Vérifie que src/app/layout.tsx et components/Sidebar.tsx utilisent le nouveau
helper. Vérifie que toutes les routes /api/admin/* le vérifient aussi.

CONTRAINTE : aucun changement fonctionnel visible. Login comme admin id 24,
id 16, id 70, client lambda → accès strictement identiques à avant.

Produis un rapport de fin : liste des fichiers modifiés, nombre de call-sites
migrés, et 3 scénarios de test manuel à jouer avant merge.
```

---

### 7.2 Phase 1 — Memberships (3-5 jours)

**Objectif :** introduire `organization_members` sans activer l'Entreprise.
Tous les clients existants ont 1 row owner. L'app continue à fonctionner
exactement pareil pour tout le monde.

**Scope :**

1. **Activer Clerk Organizations** (dashboard Clerk) en mode "Membership optional".
2. **Migration `20260426_organization_members.sql`** :
   - Créer table `organization_members` (cf. §3.3)
   - Créer helpers Postgres `current_member_ids_for_client`,
     `current_user_can_see_row`
   - Backfill : 1 row owner par `clients` ayant `clerk_user_id IS NOT NULL`
3. **Ajout de `member_id` sur toutes les tables scopées** (§3.5) :
   - Migration `20260427_add_member_id_to_scoped_tables.sql`
   - Ajout en nullable
   - Backfill : `member_id = <owner_id>` WHERE `client_id = <client>`
   - Index `(client_id, member_id)` sur chaque table
4. **Helpers TS** :
   - `src/lib/org-context.ts` : `getOrgContext(userId)`, `getEffectiveMemberId(req)`,
     `isMemberOfClient(memberId, clientId)`.
   - Refactor `lib/inbox-server.ts:getClientIdFromClerkUser` → retourne un
     tableau + un `selfMemberId`.
5. **Webhook Clerk Organizations** :
   - `src/app/api/webhooks/clerk-org/route.ts`
   - Handle `organization.created`, `organizationMembership.created`,
     `organizationMembership.deleted`, `organizationMembership.updated`
   - Sync vers `organization_members` (INSERT/UPDATE `joined_at`, `removed_at`)
6. **Propagation `member_id` dans les écritures** : partout où on insère dans
   `leads`, `linkedin_invitations`, `icp_configs`, `client_messages`,
   `inbox_threads`, etc. → ajouter `member_id: effectiveMemberId`.
   **Crucial** : même pour les clients solo, sinon on accumule de la dette.
7. **RLS** : réécrire les policies pour utiliser
   `current_user_can_see_row(client_id, member_id)`.
   - Pendant la phase de transition : policies permissives qui retombent sur
     `client_id` si `member_id IS NULL` (pour éviter de bloquer les crons qui
     n'ont pas encore été refactorés).
8. **Tests E2E non-régression** : toute la suite solo doit passer identique.

**Livrables :**
- `organization_members` peuplé pour 100% des clients (1 owner chacun)
- `member_id` peuplé pour 100% des rows des tables scopées
- Webhook Clerk Organizations en écoute
- Code lit et écrit `member_id` partout, mais le filtre reste fonctionnellement
  identique à avant (1 membre par client = tout est visible)
- Aucune UI visible de l'Entreprise

**Point de contrôle avant Phase 2 :** requêtes de vérification :
```sql
-- Aucun client sans membre owner
SELECT c.id FROM clients c
LEFT JOIN organization_members om ON om.client_id = c.id AND om.role = 'owner'
  AND om.removed_at IS NULL
WHERE c.clerk_user_id IS NOT NULL AND om.id IS NULL;
-- Doit retourner 0 lignes

-- Aucun lead sans member_id
SELECT COUNT(*) FROM leads WHERE member_id IS NULL;
-- Doit retourner 0 (après backfill)

-- Aucun double-owner
SELECT client_id, COUNT(*) FROM organization_members
WHERE role = 'owner' AND removed_at IS NULL
GROUP BY client_id HAVING COUNT(*) > 1;
-- Doit retourner 0 lignes
```

**Brief Claude Code Phase 1 :**

```
Objectif : introduire le concept de "member" dans la DB et le code, sans
aucune UI Entreprise visible. Zéro changement fonctionnel pour les users.

PRÉREQUIS : Phase 0 mergée. Clerk Organizations activé en "Membership optional"
dans le dashboard Clerk (l'utilisateur l'aura fait à la main).

ÉTAPE 1 — Migration organization_members
Crée supabase/migrations/20260426_organization_members.sql avec :
- Table organization_members (colonnes exactes dans le doc ARCHITECTURE §3.3)
- Contrainte EXCLUDE un seul owner actif par client
- Index sur clerk_user_id (WHERE removed_at IS NULL) et sur client_id
- Trigger updated_at
- Helpers : current_member_ids_for_client, current_user_can_see_row (cf. §3.6)
- RLS de base (service_role only pour INSERT/DELETE, SELECT restreint)
- Backfill : INSERT 1 row owner par clients.clerk_user_id non null

ÉTAPE 2 — Migration member_id sur les 16 tables scopées
Crée supabase/migrations/20260427_add_member_id_to_scoped_tables.sql.
Pour chaque table de la liste (§3.5) :
- ALTER TABLE ... ADD COLUMN member_id bigint NULL REFERENCES organization_members(id)
- Index (client_id, member_id)
- Backfill : UPDATE <table> SET member_id = (SELECT id FROM organization_members
  WHERE client_id = <table>.client_id AND role = 'owner' AND removed_at IS NULL)
- Ne pas mettre NOT NULL à cette étape (on le fera fin Phase 2)

ÉTAPE 3 — Helpers TS
Crée src/lib/org-context.ts avec :
- type OrgContext = { clientId, selfMemberId, role, allMemberIds? }
- getOrgContext(clerkUserId): résout via organization_members
- getEffectiveMemberId(req): lit ?as=... ou cookie lidmeo_view_as_member_id,
  vérifie que c'est valide pour le role courant
- isMemberOfClient(memberId, clientId)

Refactor lib/inbox-server.ts:getClientIdFromClerkUser pour utiliser
getOrgContext. Garde la signature compatible (retourne le premier clientId).

ÉTAPE 4 — Webhook Clerk Organizations
Crée src/app/api/webhooks/clerk-org/route.ts :
- POST public (signature Clerk webhook via CLERK_WEBHOOK_SECRET header)
- Handle organization.created, organizationMembership.created/updated/deleted
- Sync organization_members (INSERT, UPDATE joined_at, UPDATE removed_at)
- Log dans client_activity_logs

ÉTAPE 5 — Propagation member_id dans les INSERTs
Recherche tous les INSERT dans leads, linkedin_invitations, icp_configs,
client_messages, inbox_threads, inbox_messages, extraction_logs,
automation_logs, client_activity_logs, email_log, client_events,
client_onboarding_state, analytics_events, search_logs, search_credits.

Pour chaque : résoudre le member_id depuis l'auth courant ou depuis le
unipile_account_id (pour les webhooks) via organization_linkedin_accounts ou
fallback organization_members.role='owner'.

IMPORTANT : ne touche pas au code qui SELECT pour l'instant. On reste
fonctionnellement identique. On écrit member_id, on ne filtre pas dessus.

ÉTAPE 6 — RLS transitoire
Réécris les policies RLS des tables scopées pour utiliser
current_user_can_see_row() mais avec fallback sur client_id si member_id IS NULL
(pour ne pas casser les lectures pendant la transition).

ÉTAPE 7 — Vérifications de fin
Exécute les 3 requêtes de contrôle du doc (ARCHITECTURE §7.2 "Point de
contrôle") et commit un fichier CHECKS-PHASE1.md avec les résultats.

CONTRAINTE : à la fin de cette phase, l'app doit fonctionner EXACTEMENT comme
avant pour tous les clients. Si un dashboard ne s'affiche pas, si un lead
n'apparaît pas, c'est un blocage merge.
```

---

### 7.3 Phase 2 — Multi-compte LinkedIn (6-10 jours)

**Objectif :** permettre plusieurs comptes LinkedIn sur un même client, chacun
rattaché à un membre. Toujours 0 UI Entreprise, mais l'infra est prête.

**Scope :**

1. **Migration `20260502_organization_linkedin_accounts.sql`** (cf. §3.4) :
   - Créer table
   - Backfill depuis `unipile_accounts` + `client_linkedin_settings` (join)
2. **Refactor des helpers LinkedIn** :
   - `lib/inbox-server.ts:getLinkedinUnipileAccountId(clientId, memberId?)` :
     - Si `memberId` fourni : retourne le compte de ce membre
     - Sinon : retourne le compte du owner (backward compat)
   - `lib/unipile-relation-provider.ts:resolveClientIdFromUnipileAccountId` :
     devient `resolveClientAndMemberFromUnipileAccountId` et retourne
     `{ clientId, memberId }`
3. **Refactor des edge functions** :
   - `linkedin-cron-runner` : itère sur `organization_linkedin_accounts` avec
     `enabled = true AND removed_at IS NULL`
   - `followup-cron-runner` : idem
   - `linkedin-send-draft` : idem
4. **Refactor du webhook Unipile** (`api/unipile/webhook/route.ts`) :
   - Résout `memberId` depuis `unipile_account_id`
   - `autoMarkLeadResponded` : match sur `leads.member_id` en plus
   - `handleNewRelation` : `linkedin_invitations.member_id` cohérent
5. **Refactor des routes API** pour ajouter le filtre `member_id` :
   - Toutes les routes `/api/leads/*`, `/api/inbox/*`, `/api/followups/*`,
     `/api/icp/*`, `/api/messages/*`, `/api/dashboard/*`, `/api/linkedin/*`
   - Utiliser `getEffectiveMemberId(req)`
6. **Onboarding Unipile** (`/api/unipile/connect`, `/api/unipile/notify`) :
   - Passer `name: String(member.id)` à Unipile (et pas `client.id`)
   - Le notify insère dans `organization_linkedin_accounts` avec le bon
     `member_id`
7. **Suppression de `client_linkedin_settings`** (fin de Phase 2) :
   - Une fois tout le code migré, migration de suppression de la table
8. **`member_id` devient NOT NULL** sur toutes les tables scopées (migration
   de fin de Phase 2).

**Point de contrôle avant Phase 3 :**
- Un client solo continue à fonctionner : Unipile connect → notify → settings
  OK, cron tourne, followups affichés, etc.
- Infra multi-compte testée en **dev** : pour un client test, créer 2 rows
  `organization_linkedin_accounts` avec 2 `member_id` différents, vérifier
  que les crons les traitent séparément.

**Brief Claude Code Phase 2 :**

```
Objectif : transformer l'infrastructure LinkedIn en multi-compte. À la fin de
cette phase, un client peut techniquement avoir N comptes LinkedIn
(un par member), même si l'UI ne l'expose pas encore.

PRÉREQUIS : Phase 1 mergée et vérifiée.

ÉTAPE 1 — Migration organization_linkedin_accounts
Crée supabase/migrations/20260502_organization_linkedin_accounts.sql :
- Table selon §3.4 du doc ARCHITECTURE
- Publication supabase_realtime
- Backfill : pour chaque unipile_accounts row, INSERT dans la nouvelle table
  avec member_id = owner du client_id. Settings (quota, timezone, etc.)
  copiés depuis client_linkedin_settings si row existe.

ÉTAPE 2 — Refactor helpers LinkedIn
Modifie lib/inbox-server.ts:getLinkedinUnipileAccountId pour accepter un
memberId optionnel et lire depuis organization_linkedin_accounts en priorité
(fallback sur unipile_accounts/client_linkedin_settings).

Modifie lib/unipile-relation-provider.ts : la résolution unipile_account_id
→ client_id doit maintenant aussi retourner le member_id.

ÉTAPE 3 — Refactor edge functions Supabase
Dans supabase/functions/linkedin-cron-runner/, followup-cron-runner/,
linkedin-send-draft/ : remplacer la lecture de client_linkedin_settings par
organization_linkedin_accounts. Filtrer sur enabled = true AND
removed_at IS NULL. Garder compatibilité avec client_linkedin_settings
pour les clients pas encore migrés (fallback).

ÉTAPE 4 — Refactor du webhook Unipile
Dans src/app/api/unipile/webhook/route.ts :
- resolveClientAndMemberFromUnipileAccountId retourne { clientId, memberId }
- autoMarkLeadResponded : filtre leads.member_id = memberId
- handleNewRelation : linkedin_invitations créées avec member_id
- Tout INSERT/UPDATE inbox_* avec member_id

ÉTAPE 5 — Refactor routes API avec getEffectiveMemberId
Pour chaque route API listée dans src/app/api/{leads,inbox,followups,icp,
messages,dashboard,linkedin}/... :
- Remplace "const clientId = await getClientIdFromClerkUser(...)" par
  "const { clientId, effectiveMemberId } = await getOrgContext(...)"
- Ajoute .eq('member_id', effectiveMemberId) dans les queries

PAS pour les routes admin (/api/admin/*) qui gardent leur scope client_id
global (vue admin plateforme).

ÉTAPE 6 — Unipile connect/notify avec member_id
src/app/api/unipile/connect/route.ts : utilise member.id (pas client.id)
comme "name" dans le payload Unipile. Si un membre n'existe pas pour ce
clerk_user_id, le créer (cas d'un nouveau user solo qui s'inscrit post-migration).

src/app/api/unipile/notify/route.ts : INSERT dans organization_linkedin_accounts
avec member_id = parseInt(name), client_id déduit via join.

ÉTAPE 7 — Dépréciation client_linkedin_settings
Après avoir vérifié que plus aucun code ne lit client_linkedin_settings,
créer migration 20260510_deprecate_client_linkedin_settings.sql qui :
- Drop la table (après verification que organization_linkedin_accounts est
  bien peuplée pour tous les clients)

ÉTAPE 8 — member_id NOT NULL
Migration 20260511_member_id_not_null.sql :
- ALTER TABLE ... ALTER COLUMN member_id SET NOT NULL
- Pour chaque table scopée (16 tables)
- Check préalable : SELECT COUNT(*) WHERE member_id IS NULL = 0

ÉTAPE 9 — Tests
Crée un scénario de test DEV :
- Client test id X (non prod)
- Créer manuellement un 2e organization_members avec role='member'
- Connecter 2 comptes LinkedIn (un par member)
- Vérifier que le cron invite via chaque compte indépendamment
- Vérifier que les webhooks Unipile routent correctement les new_message
  vers le bon member

Produis un rapport CHECKS-PHASE2.md avec le résultat de ces tests.

CONTRAINTE : aucune UI Entreprise. Un client solo doit voir et agir
exactement comme avant.
```

---

### 7.4 Phase 3 — Plan Entreprise + UI admin org (8-12 jours)

**Objectif :** activer le plan Entreprise, ouvrir l'UI d'administration d'org,
permettre l'upgrade solo → Entreprise, permettre l'invitation de membres.

**Scope :**

1. **Migration `20260514_enterprise_plan.sql`** :
   - Relâcher `clients_plan_check` → ajouter `'enterprise'`
   - Table `org_config_broadcasts` (audit des broadcasts)
   - Colonnes `actor_member_id`, `on_behalf_of_member_id` sur
     `client_activity_logs`
2. **Stripe** :
   - Créer le produit Entreprise dans Stripe (prix à définir, modèle à définir
     plus tard — on peut commencer avec un prix fixe par org + upsell)
   - Env var `STRIPE_PRICE_ENTERPRISE`
   - `api/stripe/checkout/route.ts` : handle `plan === 'enterprise'`
   - `api/stripe/webhook/route.ts` : map `priceId` Entreprise → plan
3. **Parcours upgrade** :
   - Page `/dashboard/hub/billing` : si `plan != 'enterprise'`, afficher CTA
     "Passer à l'Entreprise"
   - Stripe Checkout → webhook → UPDATE `plan = 'enterprise'`
   - Redirect post-checkout vers `/dashboard/org` (nouveau)
4. **Nouvelles pages Entreprise** (cf. §6.4) :
   - `/dashboard/org` (landing + stats équipe)
   - `/dashboard/org/members` (liste + invite + actions)
   - `/dashboard/org/linkedin-accounts` (liste comptes LI)
   - `/dashboard/org/settings` (nom, préférences)
5. **Nouvelles routes API** (cf. §6.6 Catégorie C).
6. **Onboarding membre** (`/onboarding/member`) :
   - 3 étapes : Unipile + ICP (avec choix copie/from scratch) + vidéo
   - Appelle `api/org/copy-config` si "Reprendre" choisi
7. **OrgViewSwitcher** (composant Sidebar) :
   - Dropdown "Vue organisation / Ma vue / Vue de X / Vue de Y"
   - Cookie `lidmeo_view_as_member_id` + URL `?as=`
   - Toutes les pages `/dashboard/*` honorent `getEffectiveMemberId`
8. **Broadcast UI** :
   - Modal sur `/dashboard/hub/icp-builder` et `/dashboard/hub/messages-setup`
   - Action "Appliquer à X membre(s)"
9. **Membres : gestion départ** :
   - Modal 3 choix (réassigner / supprimer / désactiver)
   - Route `/api/org/members/[id]/remove` avec paramètre `disposition`
10. **Invitations** :
    - Template email Clerk custom (branding Lidmeo)
    - Route `/api/org/members/invite` qui appelle Clerk API
11. **Webhook Clerk extensions** : handle les cas `organizationInvitation.*`

**Livrables finaux :**
- Un client peut cliquer "Passer Entreprise" sur son billing, payer, et se
  retrouver avec une UI de gestion d'org fonctionnelle.
- Il peut inviter 1..N membres qui passent par l'onboarding simplifié et
  prospectent en parallèle.
- L'admin switche de vue pour superviser chaque membre.
- Le broadcast config fonctionne.

**Brief Claude Code Phase 3 :**

```
Objectif : activer le plan Entreprise complet (upgrade, invitations, gestion
membres, switch de vue, broadcast). 

PRÉREQUIS : Phases 0-2 mergées et vérifiées. STRIPE_PRICE_ENTERPRISE configuré
dans les env (l'utilisateur aura créé le produit Stripe à la main).

ÉTAPE 1 — Migration enterprise_plan
Crée supabase/migrations/20260514_enterprise_plan.sql :
- ALTER constraint clients_plan_check pour inclure 'enterprise'
- Table org_config_broadcasts (§5.3 du doc)
- ALTER TABLE client_activity_logs ADD actor_member_id, on_behalf_of_member_id

ÉTAPE 2 — Stripe Entreprise
Dans api/stripe/checkout/route.ts : handle le cas plan='enterprise' avec
STRIPE_PRICE_ENTERPRISE. Dans api/stripe/webhook/route.ts : map le priceId
Entreprise → plan='enterprise' dans priceToPlanAndQuota().

ÉTAPE 3 — Nouvelles routes API /api/org/*
Crée toutes les routes listées dans §6.6 Catégorie C. Pour chaque :
- Vérifier le role via getOrgContext (admin ou owner requis, sauf GET members
  qui peut être ouvert à tous les membres de l'org)
- Logger dans client_activity_logs avec actor_member_id

Détails importants :
- /api/org/members POST : appel clerkClient.organizations.createOrganizationInvitation
- /api/org/broadcast-config : snapshot avant écrasement, INSERT org_config_broadcasts
- /api/org/linkedin-accounts/[id]/reassign : UPDATE member_id sur la row
  organization_linkedin_accounts ET sur toutes les rows dépendantes
  (leads, linkedin_invitations, inbox_threads... prévoir une transaction)

ÉTAPE 4 — Pages UI Entreprise
Crée les pages dans src/app/dashboard/org/ :
- page.tsx (landing)
- members/page.tsx
- members/invite/page.tsx
- linkedin-accounts/page.tsx
- settings/page.tsx

IMPORTANT : appeler SKILL frontend-design avant de coder les pages.
Utiliser les design tokens Lidmeo (#316DED primary, #001ba2 navy, Inter/DM Sans,
pas d'em dash). Les pages /dashboard/org ne sont visibles que si
plan === 'enterprise' et role in ('owner', 'admin').

ÉTAPE 5 — OrgViewSwitcher dans la sidebar
Crée components/OrgViewSwitcher.tsx :
- Dropdown avec "Vue organisation", "Ma vue", et 1 entrée par member actif
- Persist dans cookie lidmeo_view_as_member_id (HttpOnly, SameSite=Lax)
- Appel POST /api/org/view-as pour set le cookie

Monte-le dans components/Sidebar.tsx, visible uniquement pour admin/owner
d'un client avec plan='enterprise'.

ÉTAPE 6 — Onboarding membre
Crée src/app/onboarding/member/page.tsx avec 3 étapes :
- Étape 1 : connexion Unipile (identique à /onboarding mais passe member.id
  en name)
- Étape 2 : choix "Reprendre config de X" ou "Configurer from scratch"
  - Si reprendre : POST /api/org/copy-config { source_member_id, scope: 'both' }
  - Si from scratch : redirige vers icp-builder existant
- Étape 3 : vidéo (réutilise le composant existant)

Middleware : route /onboarding doit rediriger vers /onboarding/member si
l'user est un membre invité (role='member' et joined_at récent).

ÉTAPE 7 — Broadcast UI
Modifie src/app/dashboard/hub/icp-builder/page.tsx et
src/app/dashboard/hub/messages-setup/page.tsx :
- Après sauvegarde, afficher toast avec action secondaire "Appliquer à..."
- Modal avec checkboxes des autres membres + radio scope
- POST /api/org/broadcast-config

Ne s'affiche que si role in ('owner', 'admin').

ÉTAPE 8 — Suppression / réassignement membre
Sur /dashboard/org/members, chaque ligne a un menu "..." avec :
- "Promouvoir en admin" (si role='member', owner only)
- "Rétrograder en membre" (si role='admin', owner only)
- "Retirer de l'organisation" → modal 3 choix (réassigner/supprimer/désactiver)

ÉTAPE 9 — Guards partout
Vérifier que :
- /dashboard/hub/billing : visible owner seulement en Entreprise, tous en solo
- /dashboard/org/* : admin/owner seulement
- Toutes les mutations sur ressources d'autres membres : check role admin/owner
- getEffectiveMemberId appelé dans toutes les routes API scopées

ÉTAPE 10 — Parcours upgrade solo → Entreprise
Sur /dashboard/hub/billing : si plan != 'enterprise', afficher bloc
"Gérer une équipe avec Entreprise" avec CTA.
Stripe Checkout → webhook → UPDATE plan → redirect vers /dashboard/org.
Le client existant devient automatiquement owner (sa row organization_members
existe déjà depuis Phase 1, il faut juste s'assurer que role='owner').

ÉTAPE 11 — QA complet
Scénarios à tester :
1. Client solo plan='full' → inchangé (leads, inbox, followups OK)
2. Client solo → upgrade Entreprise → redirige vers /dashboard/org
3. Invite un membre → email reçu → signup Clerk → onboarding member →
   connecter LinkedIn → choisir "reprendre config admin" → dashboard OK
4. Admin switch "vue de membre" → voit leads/inbox du membre → peut agir
5. Admin édite son ICP → broadcast à 2 autres membres → vérif ICP copié
6. Admin retire un membre avec réassignation → leads du membre passent au
   target → compte LI réassigné
7. Membre lambda : ne voit pas /dashboard/org, ne peut pas inviter, ne voit
   pas les leads des autres

Produis un rapport CHECKS-PHASE3.md avec ces 7 scénarios.

CONTRAINTE : les clients solo existants ne doivent RIEN voir de neuf.
```

---

### 7.5 Phase 4 — Refonte inbox (post-Entreprise, pas dans ce scope)

Mentionnée pour mémoire. Ne démarre qu'après que l'Entreprise est en prod,
stable, avec au moins 1-2 clients Entreprise actifs pour cadrer les besoins
réels. Le scope probable :

- Inbox unifiée multi-comptes (admin voit toutes les conversations de tous
  les membres dans une vue consolidée, avec filtres par membre)
- Threads groupés par contact (si un prospect répond via 2 membres différents,
  on voit les 2 convs côte à côte)
- Recherche full-text, labels, assignation, statuts
- Responses IA (déjà partiellement là), templates rapides
- Mobile-friendly

Ce chantier bénéficie aussi aux solo (Essential et Full) : l'UX s'améliore
pour tout le monde. C'est une bonne raison de le traiter à part.

---

## 8. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Backfill `member_id` incomplet (NULL résiduels) | Queries retournent rows fantômes ou rien | Check SQL avant NOT NULL, script de vérif idempotent |
| Double owner suite à bug Clerk webhook | Contrainte EXCLUDE échoue → INSERT rejeté | Contrainte DB + gestion d'erreur côté webhook (log + alerte) |
| Upgrade Stripe rejoué 2x | Row `organization_members` owner créée 2 fois | UPSERT ON CONFLICT, idempotence par `stripe_event_id` dans `subscription_events` |
| Admin "vue de X" confondu avec "vue org" lors d'une action | Action faite au mauvais scope | `getEffectiveMemberId` strict + audit log `on_behalf_of_member_id` |
| Membre voit les leads d'un autre par défaut RLS | Fuite de données | Tests RLS dédiés (pgTAP ou tests E2E) avant merge Phase 2 |
| Broadcast écrase la config d'un membre qui l'avait ajustée | Perte de travail | Snapshot dans `org_config_broadcasts`, UI rollback côté admin |
| Cron linkedin-cron-runner continue à lire `client_linkedin_settings` après suppression | Crash ou pas d'invit envoyées | Tests sur environnement dev avant drop, fallback code qui match les 2 tables |
| `publicMetadata.client_id` encore utilisé ailleurs après Phase 0 | Résolution admin cassée | Grep exhaustif pré-merge Phase 0 |
| Un membre change de compte Clerk (nouvel email) | `clerk_user_id` change, `organization_members` orphelin | Webhook Clerk `user.updated` pour sync (à ajouter Phase 1) |
| Suppression d'un `clients` cascade sur `organization_members` et perd l'historique | Perte audit | `ON DELETE CASCADE` OK en Phase 1, mais évaluer soft-delete sur `clients` plus tard |

---

## 9. Métriques à suivre post-lancement

- Nombre de clients Entreprise (total, par mois)
- Nombre moyen de membres par org Entreprise
- Nombre moyen de comptes LI par org
- Taux d'activation membre (invite → LinkedIn connecté → premier lead prospecté)
- % de membres qui choisissent "Reprendre config" vs "From scratch"
- Nombre de broadcasts/mois et scope moyen
- Taux de churn Entreprise vs solo Full
- Support tickets / org Entreprise (à comparer solo)

Ces métriques vivent dans `/admin/analytics` (étendue Phase 3 ou post-Phase 3).

---

## 10. Glossaire

| Terme | Sens dans ce doc |
|---|---|
| Client (au sens DB) | Row de la table `clients`. Porte le plan, le Stripe, les données métier |
| Organisation (Entreprise) | Un `clients` avec `plan = 'enterprise'`. Concept logique |
| Membre | Row de `organization_members`. Utilisateur Clerk rattaché à un client |
| Owner | Le membre créateur/payeur. 1 par org |
| Admin (org) | Membre avec privilèges étendus dans son org |
| Admin plateforme | Employé Lidmeo avec `platform_role` DB |
| Solo | Client avec `plan IN ('essential', 'full')` sans autre membre |
| Compte LI | Row de `organization_linkedin_accounts`. Représente 1 compte LinkedIn Unipile |
| Scope | Filtre `(client_id, member_id)` appliqué aux queries |
| Vue en tant que | Mode admin où `effectiveMemberId != selfMemberId` |
| Broadcast | Action admin qui copie sa config vers N membres |

---

**Fin du document.** Ce plan est figé. L'exécution commence par la Phase 0.
