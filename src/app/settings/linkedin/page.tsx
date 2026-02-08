"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Linkedin } from "lucide-react";

type StatusResponse = {
  connected: boolean;
  provider?: string;
  account?: {
    id: string;
    username: string;
    display_name: string;
    profile_url: string;
    connected_at: string;
  } | null;
};

export default function LinkedInSettingsPage() {
  const [loadingConnect, setLoadingConnect] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/unipile/status");
        const json = await res.json();
        setStatus(json);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingStatus(false);
      }
    };
    fetchStatus();
  }, []);

  const connect = async () => {
    setLoadingConnect(true);
    try {
      const res = await fetch("/api/unipile/connect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error);
      window.location.href = json.url;
    } catch (e) {
      console.error(e);
      alert("Impossible de générer le lien de connexion LinkedIn.");
    } finally {
      setLoadingConnect(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Connexion LinkedIn
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connecte ton compte LinkedIn pour activer l’inbox et l’automatisation Lidmeo.
        </p>
      </div>

      <Separator />

      {/* Status */}
      {loadingStatus ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Chargement du statut…
          </CardContent>
        </Card>
      ) : status?.connected ? (
        <Alert>
          <AlertTitle className="flex items-center gap-2">
          <Badge variant="secondary">Connecté</Badge>
                      Compte LinkedIn actif
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <div className="text-sm">
              <span className="font-medium">
                {status.account?.display_name}
              </span>
              <span className="text-muted-foreground">
                {" "}
                (@{status.account?.username})
              </span>
            </div>
            <a
              href={status.account?.profile_url}
              target="_blank"
              className="text-sm text-blue-500 hover:underline"
            >
              Voir le profil LinkedIn →
            </a>
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Linkedin className="h-5 w-5 text-blue-500" />
              Connecter LinkedIn
            </CardTitle>
            <CardDescription>
              Autorise Lidmeo à envoyer et recevoir des messages LinkedIn pour toi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              <li>Envoi automatique de messages</li>
              <li>Réception centralisée dans l’inbox Lidmeo</li>
              <li>Aucune action manuelle requise</li>
            </ul>

            <Button
              onClick={connect}
              disabled={loadingConnect}
              className="w-full"
            >
              {loadingConnect ? "Connexion en cours…" : "Connecter LinkedIn"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}