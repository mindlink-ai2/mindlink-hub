// Clés de cache TanStack Query — hiérarchiques et typées

export const queryKeys = {
  leads: () => ["leads"] as const,
  mapLeads: () => ["map-leads"] as const,
  dashboardStats: () => ["dashboard", "stats"] as const,
  dashboardDrilldown: (type: string) => ["dashboard", "drilldown", type] as const,
  supportConversations: () => ["support", "conversations"] as const,
  supportMessages: (conversationId: string) =>
    ["support", "messages", conversationId] as const,
  inboxThreads: () => ["inbox", "threads"] as const,
  inboxUnreadCount: () => ["inbox", "unread-count"] as const,
  inboxClientId: () => ["inbox", "client-id"] as const,
  linkedinSettings: () => ["linkedin", "settings"] as const,
  billingStatus: () => ["billing", "status"] as const,
} as const;
