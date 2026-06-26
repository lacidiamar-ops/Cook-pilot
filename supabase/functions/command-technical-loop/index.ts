import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LoopRequest = {
  workspaceId: string;
  incidentId: string;
  instruction?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const technicalSystemPrompt = `Tu es l'Agent technique de Cook Pilot et tu appliques une boucle stricte de réparation à la racine.

Règle absolue : ne propose jamais un patch spéculatif comme réparation. Un workaround temporaire peut être décrit pour limiter l'impact, mais il ne clôture jamais l'incident.

Tu dois suivre cet ordre : observation, reproduction, cartographie des dépendances, hypothèses, expérimentation isolée, confirmation de cause racine, conception de réparation, vérification, tests de régression, canary, clôture.

Tu ne déploies jamais en production. Tu ne modifies aucun accès sensible. Tu produis uniquement une étape d'investigation ou un plan de réparation vérifiable.

Réponds en JSON strict avec les clés :
phase, evidence_needed, impacted_components, hypotheses, next_experiment, root_cause_candidate, root_cause_confidence, root_fix_design, regression_scope, rollback_plan, release_blocked, explanation.

La valeur root_cause_candidate ne peut être true que lorsque la reproduction et l'expérimentation expliquent le symptôme. release_blocked doit être true tant que la cause racine, les tests de régression, le rollback et l'approbation production ne sont pas complets.`;

function headers(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("COMMAND_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const value = allowed.includes(origin) ? origin : allowed[0] ?? "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function extractJson(content: string): Record<string, unknown> {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? content;
  try {
    return JSON.parse(fenced.trim());
  } catch {
    return {
      phase: "investigating",
      evidence_needed: [],
      hypotheses: [],
      release_blocked: true,
      explanation: content,
    };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: headers(request) });
  if (request.method !== "POST") return json(request, { error: "Méthode non autorisée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const glmKey = Deno.env.get("ZAI_GLM_API_KEY");
  const authorization = request.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey || !glmKey) {
    return json(request, { error: "Configuration serveur incomplète" }, 500);
  }
  if (!authorization.startsWith("Bearer ")) {
    return json(request, { error: "Session utilisateur requise" }, 401);
  }

  let payload: LoopRequest;
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: "Corps JSON invalide" }, 400);
  }

  if (!uuidPattern.test(payload.workspaceId ?? "") || !uuidPattern.test(payload.incidentId ?? "")) {
    return json(request, { error: "Identifiants invalides" }, 422);
  }

  const user = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await user.auth.getUser();
  if (authError || !authData.user) return json(request, { error: "Session invalide" }, 401);

  const { data: membership } = await service
    .from("command_workspace_members")
    .select("role")
    .eq("workspace_id", payload.workspaceId)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  const { data: workspace } = await service
    .from("command_workspaces")
    .select("owner_user_id")
    .eq("id", payload.workspaceId)
    .maybeSingle();

  if (!workspace || (workspace.owner_user_id !== authData.user.id && !membership)) {
    return json(request, { error: "Accès refusé au workspace" }, 403);
  }

  const { data: incident, error: incidentError } = await service
    .from("command_technical_incidents")
    .select("*")
    .eq("id", payload.incidentId)
    .eq("workspace_id", payload.workspaceId)
    .single();

  if (incidentError || !incident) return json(request, { error: "Incident introuvable" }, 404);

  const { data: iterations } = await service
    .from("command_technical_iterations")
    .select("iteration_number, phase, evidence, hypothesis, experiment, result, confidence, created_at")
    .eq("incident_id", payload.incidentId)
    .order("iteration_number", { ascending: false })
    .limit(8);

  const { data: regressions } = await service
    .from("command_technical_regression_runs")
    .select("environment, status, test_scope, summary, completed_at")
    .eq("incident_id", payload.incidentId)
    .order("created_at", { ascending: false })
    .limit(8);

  const context = {
    incident: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      reproduction_status: incident.reproduction_status,
      root_cause_summary: incident.root_cause_summary,
      root_cause_confidence: incident.root_cause_confidence,
      affected_components: incident.affected_components,
      dependency_map: incident.dependency_map,
      fix_strategy: incident.fix_strategy,
    },
    recent_iterations: iterations ?? [],
    regression_runs: regressions ?? [],
    operator_instruction: payload.instruction ?? null,
  };

  const model = Deno.env.get("ZAI_GLM_MODEL") ?? "glm-5.2";
  const modelResponse = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${glmKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: technicalSystemPrompt },
        { role: "user", content: JSON.stringify(context) },
      ],
      temperature: 0.15,
      stream: false,
    }),
  });

  if (!modelResponse.ok) {
    const detail = await modelResponse.text();
    return json(request, { error: "GLM indisponible", detail: detail.slice(0, 500) }, 502);
  }

  const raw = await modelResponse.json();
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return json(request, { error: "Réponse technique vide" }, 502);
  }

  const result = extractJson(content);
  const nextIteration = (iterations?.[0]?.iteration_number ?? 0) + 1;
  const confidence = Math.max(0, Math.min(1, Number(result.root_cause_confidence ?? 0)));
  const isRootCause = result.root_cause_candidate === true && confidence >= 0.85 && incident.reproduction_status !== "not_started";
  const phase = typeof result.phase === "string" ? result.phase : "investigating";

  const { data: iteration, error: iterationError } = await service
    .from("command_technical_iterations")
    .insert({
      workspace_id: payload.workspaceId,
      incident_id: payload.incidentId,
      iteration_number: nextIteration,
      phase,
      evidence: {
        evidence_needed: result.evidence_needed ?? [],
        impacted_components: result.impacted_components ?? [],
        regression_scope: result.regression_scope ?? [],
        rollback_plan: result.rollback_plan ?? null,
        raw_response: content,
      },
      hypothesis: Array.isArray(result.hypotheses) ? result.hypotheses.join("\n") : null,
      experiment: typeof result.next_experiment === "string" ? result.next_experiment : null,
      result: typeof result.explanation === "string" ? result.explanation : null,
      root_cause_candidate: isRootCause,
      confidence,
      created_by_agent_key: "technical",
    })
    .select("id")
    .single();

  if (iterationError || !iteration) return json(request, { error: "Impossible d’enregistrer l’itération" }, 500);

  const incidentPatch: Record<string, unknown> = {
    status: isRootCause ? "root_cause_confirmed" : "investigating",
    root_cause_confidence: confidence,
    dependency_map: incident.dependency_map ?? {},
    affected_components: result.impacted_components ?? incident.affected_components ?? [],
  };

  if (isRootCause) {
    incidentPatch.root_cause_summary = typeof result.explanation === "string" ? result.explanation : "Cause racine à confirmer";
    incidentPatch.root_cause_confirmed_at = new Date().toISOString();
    incidentPatch.fix_strategy = "root_fix";
    incidentPatch.rollback_reference = typeof result.rollback_plan === "string" ? result.rollback_plan : null;
  }

  await service.from("command_technical_incidents").update(incidentPatch).eq("id", payload.incidentId);

  if (isRootCause) {
    const gates = ["root_cause_confirmed", "reproduction_passed", "regression_passed", "rollback_ready", "founder_approval", "canary_healthy"];
    await service.from("command_technical_release_gates").upsert(
      gates.map((gateKey) => ({
        workspace_id: payload.workspaceId,
        incident_id: payload.incidentId,
        gate_key: gateKey,
        status: gateKey === "root_cause_confirmed" ? "passed" : "pending",
        evidence: gateKey === "root_cause_confirmed" ? { iteration_id: iteration.id, confidence } : {},
      })),
      { onConflict: "incident_id,gate_key" },
    );
  }

  await service.from("command_audit_log").insert({
    workspace_id: payload.workspaceId,
    actor_type: "agent",
    agent_key: "technical",
    event_type: "technical_root_cause_iteration",
    entity_type: "command_technical_incident",
    entity_id: payload.incidentId,
    details: { iteration_id: iteration.id, phase, confidence, is_root_cause: isRootCause, model },
  });

  return json(request, {
    incidentId: payload.incidentId,
    iterationId: iteration.id,
    phase,
    rootCauseConfirmed: isRootCause,
    confidence,
    releaseBlocked: result.release_blocked !== false,
    result,
  });
});
