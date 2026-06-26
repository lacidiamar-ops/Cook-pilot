import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Decision = "approved" | "rejected";
type DecisionMode = "voice" | "button";

type ApprovalInput = {
  approvalId: string;
  decision: Decision;
  decisionMode: DecisionMode;
  decisionNote?: string;
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

  let input: ApprovalInput;
  try {
    input = await request.json();
  } catch {
    return json(request, { error: "Corps JSON invalide" }, 400);
  }

  if (
    !uuidPattern.test(input.approvalId ?? "") ||
    !["approved", "rejected"].includes(input.decision) ||
    !["voice", "button"].includes(input.decisionMode) ||
    (input.decisionNote && input.decisionNote.length > 2000)
  ) {
    return json(request, { error: "Décision invalide" }, 422);
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

  const { data: approval, error: approvalError } = await service
    .from("command_approvals")
    .select("id, workspace_id, voice_request_id, agent_run_id, ticket_id, action_type, title, status")
    .eq("id", input.approvalId)
    .maybeSingle();

  if (approvalError || !approval) return json(request, { error: "Validation introuvable" }, 404);
  if (approval.status !== "pending") return json(request, { error: "Cette validation a déjà été traitée" }, 409);

  const [{ data: workspace }, { data: membership }] = await Promise.all([
    service
      .from("command_workspaces")
      .select("owner_user_id")
      .eq("id", approval.workspace_id)
      .maybeSingle(),
    service
      .from("command_workspace_members")
      .select("role")
      .eq("workspace_id", approval.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const canApprove = workspace?.owner_user_id === user.id || ["founder", "admin"].includes(membership?.role ?? "");
  if (!canApprove) return json(request, { error: "Droits de validation insuffisants" }, 403);

  const now = new Date().toISOString();
  const { error: updateError } = await service
    .from("command_approvals")
    .update({
      status: input.decision,
      decided_by_user_id: user.id,
      decision_mode: input.decisionMode,
      decision_note: input.decisionNote?.trim() || null,
      decided_at: now,
    })
    .eq("id", approval.id)
    .eq("status", "pending");

  if (updateError) return json(request, { error: "Impossible d'enregistrer la décision" }, 500);

  const approved = input.decision === "approved";
  const updates: PromiseLike<unknown>[] = [
    service.from("command_audit_log").insert({
      workspace_id: approval.workspace_id,
      actor_type: "founder",
      actor_user_id: user.id,
      event_type: approved ? "approval_granted" : "approval_rejected",
      entity_type: "command_approval",
      entity_id: approval.id,
      details: {
        action_type: approval.action_type,
        decision_mode: input.decisionMode,
        decision_note: input.decisionNote?.trim() || null,
      },
    }),
  ];

  if (approval.agent_run_id) {
    updates.push(
      service
        .from("command_agent_runs")
        .update({ run_status: approved ? "completed" : "cancelled", completed_at: now })
        .eq("id", approval.agent_run_id),
    );
  }
  if (approval.voice_request_id) {
    updates.push(
      service
        .from("command_voice_requests")
        .update({ status: approved ? "approved" : "rejected", completed_at: now })
        .eq("id", approval.voice_request_id),
    );
  }
  if (approval.ticket_id) {
    updates.push(
      service
        .from("command_support_tickets")
        .update({ status: "in_progress" })
        .eq("id", approval.ticket_id),
    );
  }

  await Promise.all(updates);

  const followUp = approved
    ? "Décision enregistrée. L'agent peut maintenant exécuter uniquement la procédure autorisée et informer le restaurant."
    : "Décision enregistrée. L'agent conserve le ticket ouvert et poursuit le diagnostic sans appliquer l'action proposée.";

  return json(request, {
    approvalId: approval.id,
    status: input.decision,
    followUp,
    spokenResponse: followUp,
  });
});
