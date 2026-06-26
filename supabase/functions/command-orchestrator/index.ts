import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Source = "voice" | "text";
type AgentKey = "technical" | "finance" | "commercial" | "customer_success" | "journal" | "marketing" | "orchestrator";
type RiskLevel = "low" | "medium" | "high" | "critical";

type CommandInput = {
  workspaceId: string;
  transcript: string;
  source?: Source;
  restaurantId?: string;
  appConnectionId?: string;
  reporter?: {
    name?: string;
    email?: string;
  };
};

type Route = {
  agentKey: AgentKey;
  agentLabel: string;
  riskLevel: RiskLevel;
  needsApproval: boolean;
  actionType?: string;
  summary: string;
  ticketSubject?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = (Deno.env.get("COMMAND_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const allowedOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] ?? "http://localhost:5173";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function routeCommand(transcript: string): Route {
  const text = transcript.toLocaleLowerCase("fr-FR");
  const isLoginIssue = /(connexion|connecter|connecte|login|mot de passe|identifiant|compte bloqu|session expir)/.test(text);
  const isTechnical = /(erreur|bug|incident|application|tablette|scan|mise à jour|correctif|déploi)/.test(text);
  const isFinance = /(facture|impay|relance|paiement|avoir|rembours|trésorerie|dépense)/.test(text);
  const isCommercial = /(devis|prospect|offre|abonnement|contrat|tarif)/.test(text);
  const isSuccess = /(onboarding|adoption|formation|utilise|utilisation|client)/.test(text);
  const isJournal = /(journal|informe|information|communique|mise à jour produit|nouveauté)/.test(text);
  const sensitive = /(supprim|suspend|réinitial|reinitial|mot de passe|paiement|rembours|avoir|déploi|production|envoie.*tous|mail.*tous)/.test(text);

  if (isLoginIssue || isTechnical) {
    return {
      agentKey: "technical",
      agentLabel: "Agent technique Cook Pilot",
      riskLevel: isLoginIssue || sensitive ? "high" : "medium",
      needsApproval: isLoginIssue || sensitive,
      actionType: isLoginIssue ? "account_recovery" : "technical_intervention",
      ticketSubject: isLoginIssue ? "Impossible de se connecter" : "Incident technique à analyser",
      summary: isLoginIssue
        ? "Je crée un ticket, vérifie les éléments techniques autorisés et prépare une procédure de récupération. Toute modification d'accès reste soumise à votre validation."
        : "Je crée un ticket technique, rassemble les informations utiles et prépare la suite sans modifier le système sans validation.",
    };
  }

  if (isFinance) {
    return {
      agentKey: "finance",
      agentLabel: "Agent finance Cook Pilot",
      riskLevel: sensitive ? "high" : "medium",
      needsApproval: sensitive,
      actionType: sensitive ? "financial_action" : undefined,
      summary: "Je prépare l'analyse financière et les documents nécessaires. Toute relance non standard, avoir, remboursement ou action sur un paiement remonte à validation.",
    };
  }

  if (isCommercial) {
    return {
      agentKey: "commercial",
      agentLabel: "Agent commercial Cook Pilot",
      riskLevel: sensitive ? "high" : "medium",
      needsApproval: sensitive,
      actionType: sensitive ? "commercial_commitment" : undefined,
      summary: "Je prépare le devis ou la proposition commerciale. Les prix, engagements contractuels et envois sensibles restent à valider.",
    };
  }

  if (isSuccess) {
    return {
      agentKey: "customer_success",
      agentLabel: "Agent relation client Cook Pilot",
      riskLevel: "low",
      needsApproval: false,
      summary: "Je prépare l'analyse d'adoption, les actions d'accompagnement et les éventuels messages de suivi.",
    };
  }

  if (isJournal) {
    return {
      agentKey: "journal",
      agentLabel: "Agent information Cook Pilot",
      riskLevel: sensitive ? "high" : "low",
      needsApproval: sensitive,
      actionType: sensitive ? "mass_communication" : undefined,
      summary: "Je prépare l'information, cible les restaurants concernés et conserve l'envoi en brouillon tant qu'une validation est nécessaire.",
    };
  }

  return {
    agentKey: "orchestrator",
    agentLabel: "Orchestrateur Cook Pilot",
    riskLevel: "low",
    needsApproval: false,
    summary: "Je décompose la demande, attribue les sous-actions aux bons agents et vous remonte uniquement les points de décision.",
  };
}

async function requireWorkspaceAccess(
  service: ReturnType<typeof createClient>,
  workspaceId: string,
  userId: string,
) {
  const [{ data: workspace, error: workspaceError }, { data: membership, error: membershipError }] = await Promise.all([
    service.from("command_workspaces").select("id, owner_user_id").eq("id", workspaceId).maybeSingle(),
    service
      .from("command_workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (workspaceError || membershipError || !workspace) return false;
  return workspace.owner_user_id === userId || Boolean(membership);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") ?? "";

  if (!url || !anonKey || !serviceKey) {
    return json(request, { error: "Configuration serveur incomplète" }, 500);
  }
  if (!authorization.startsWith("Bearer ")) {
    return json(request, { error: "Session utilisateur requise" }, 401);
  }

  let input: CommandInput;
  try {
    input = await request.json();
  } catch {
    return json(request, { error: "Corps JSON invalide" }, 400);
  }

  const transcript = input.transcript?.trim();
  if (!uuidPattern.test(input.workspaceId ?? "") || !transcript || transcript.length > 12000) {
    return json(request, { error: "Demande vocale invalide" }, 422);
  }
  if (input.restaurantId && !uuidPattern.test(input.restaurantId)) {
    return json(request, { error: "Restaurant invalide" }, 422);
  }
  if (input.appConnectionId && !uuidPattern.test(input.appConnectionId)) {
    return json(request, { error: "Connexion applicative invalide" }, 422);
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;
  if (authError || !user) return json(request, { error: "Session expirée ou invalide" }, 401);

  const hasAccess = await requireWorkspaceAccess(service, input.workspaceId, user.id);
  if (!hasAccess) return json(request, { error: "Accès refusé à ce poste de commandement" }, 403);

  const route = routeCommand(transcript);
  const source: Source = input.source === "text" ? "text" : "voice";
  const now = new Date().toISOString();

  const { data: voiceRequest, error: voiceError } = await service
    .from("command_voice_requests")
    .insert({
      workspace_id: input.workspaceId,
      restaurant_id: input.restaurantId ?? null,
      requested_by_user_id: user.id,
      source,
      transcript,
      assigned_agent_key: route.agentKey,
      risk_level: route.riskLevel,
      status: "processing",
      started_at: now,
      normalized_intent: {
        routing_version: "v1-rules",
        agent_key: route.agentKey,
        action_type: route.actionType ?? null,
      },
    })
    .select("id")
    .single();

  if (voiceError || !voiceRequest) {
    return json(request, { error: "Impossible d'enregistrer la demande" }, 500);
  }

  let ticketId: string | null = null;
  if (route.agentKey === "technical") {
    const { data: ticket } = await service
      .from("command_support_tickets")
      .insert({
        workspace_id: input.workspaceId,
        restaurant_id: input.restaurantId ?? null,
        app_connection_id: input.appConnectionId ?? null,
        created_from_voice_request_id: voiceRequest.id,
        source: source === "voice" ? "voice" : "chat",
        status: route.needsApproval ? "waiting_approval" : "open",
        priority: route.riskLevel === "high" ? "high" : "normal",
        reporter_name: input.reporter?.name ?? null,
        reporter_email: input.reporter?.email ?? null,
        subject: route.ticketSubject ?? "Demande technique Cook Pilot",
        description: transcript,
        assigned_agent_key: "technical",
        diagnostic: { state: "initial_analysis", routing: "v1-rules" },
      })
      .select("id")
      .single();
    ticketId = ticket?.id ?? null;
  }

  const { data: agentRun, error: agentRunError } = await service
    .from("command_agent_runs")
    .insert({
      workspace_id: input.workspaceId,
      voice_request_id: voiceRequest.id,
      agent_key: route.agentKey,
      run_status: route.needsApproval ? "awaiting_approval" : "completed",
      risk_level: route.riskLevel,
      input_payload: { transcript, source, restaurant_id: input.restaurantId ?? null },
      output_payload: { summary: route.summary, routing: "v1-rules" },
      started_at: now,
      completed_at: route.needsApproval ? null : now,
    })
    .select("id")
    .single();

  if (agentRunError || !agentRun) {
    await service.from("command_voice_requests").update({ status: "failed", completed_at: now }).eq("id", voiceRequest.id);
    return json(request, { error: "Impossible de lancer l'agent" }, 500);
  }

  let approvalId: string | null = null;
  if (route.needsApproval) {
    const { data: approval } = await service
      .from("command_approvals")
      .insert({
        workspace_id: input.workspaceId,
        voice_request_id: voiceRequest.id,
        agent_run_id: agentRun.id,
        ticket_id: ticketId,
        action_type: route.actionType ?? "sensitive_action",
        title: "Validation requise avant action",
        description: route.summary,
        action_payload: {
          transcript,
          agent_key: route.agentKey,
          restaurant_id: input.restaurantId ?? null,
          ticket_id: ticketId,
        },
        risk_level: route.riskLevel,
        requested_by_agent_key: route.agentKey,
      })
      .select("id")
      .single();
    approvalId = approval?.id ?? null;
  }

  const finalStatus = route.needsApproval ? "awaiting_approval" : "completed";
  await Promise.all([
    service
      .from("command_voice_requests")
      .update({ status: finalStatus, result_summary: route.summary, completed_at: route.needsApproval ? null : now })
      .eq("id", voiceRequest.id),
    service.from("command_audit_log").insert({
      workspace_id: input.workspaceId,
      actor_type: "founder",
      actor_user_id: user.id,
      agent_key: route.agentKey,
      event_type: "voice_command_received",
      entity_type: "command_voice_request",
      entity_id: voiceRequest.id,
      details: {
        source,
        route: route.agentKey,
        requires_approval: route.needsApproval,
        ticket_id: ticketId,
      },
    }),
  ]);

  const spokenResponse = route.needsApproval
    ? `Demande confiée à ${route.agentLabel}. ${route.summary} Une validation est en attente.`
    : `Demande confiée à ${route.agentLabel}. ${route.summary}`;

  return json(request, {
    voiceRequestId: voiceRequest.id,
    agentRunId: agentRun.id,
    ticketId,
    approvalId,
    agent: { key: route.agentKey, label: route.agentLabel },
    status: finalStatus,
    requiresApproval: route.needsApproval,
    displaySummary: route.summary,
    spokenResponse,
  });
});
