import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AgentKey = "technical" | "support" | "commercial" | "prospecting";
type Source = "voice" | "text";

type AgentRequest = {
  workspaceId: string;
  input: string;
  source?: Source;
  agentKey?: AgentKey;
  restaurantId?: string;
  leadId?: string;
  ticketId?: string;
  quoteId?: string;
};

type AgentDefinition = {
  key: AgentKey;
  label: string;
  provider: "zai_glm" | "deepseek";
  model: string;
  systemPrompt: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const agents: Record<AgentKey, AgentDefinition> = {
  technical: {
    key: "technical",
    label: "Agent technique Cook Pilot",
    provider: "zai_glm",
    model: "glm-5.2",
    systemPrompt: `Tu es l'Agent technique de Cook Pilot. Tu analyses les incidents, logs, intégrations, schémas de données, erreurs applicatives et plans de correction. Tu peux préparer un diagnostic, une liste de vérifications et une proposition de correctif. Tu ne déploies jamais en production, ne modifies jamais un accès et ne réinitialises jamais un compte sans une validation explicite enregistrée. Si la communication client est nécessaire, tu prépares une synthèse et tu transmets la main à l'Agent support. Réponds en français, de façon opérationnelle, avec : diagnostic, éléments à vérifier, action proposée, niveau de risque, besoin ou non de validation, et éventuel transfert à un autre agent.`,
  },
  support: {
    key: "support",
    label: "Agent support Cook Pilot",
    provider: "deepseek",
    model: "deepseek-v4-pro",
    systemPrompt: `Tu es l'Agent support de Cook Pilot. Tu reçois les demandes des restaurants, crées et mets à jour les tickets, aides à l'utilisation, rédiges des réponses client claires et suis la résolution. Tu ne consultes pas de données RH sensibles, ne réinitialises pas d'accès sensibles et ne fais pas de modification technique en production. Si le problème ressemble à une anomalie technique, tu transfères au technique avec un résumé reproductible. Réponds en français avec : réponse destinée au client, ticket ou action à créer, informations manquantes, besoin ou non de validation, et éventuel transfert à l'Agent technique.`,
  },
  commercial: {
    key: "commercial",
    label: "Agent commercial Cook Pilot",
    provider: "deepseek",
    model: "deepseek-v4-pro",
    systemPrompt: `Tu es l'Agent commercial de Cook Pilot. Tu qualifies le besoin, construis des devis, proposes les modules Gestion, Human, HACCP et Scan, prépares les relances et les documents commerciaux. Tu respectes strictement le catalogue de prix fourni. Tu ne promets pas de remise, ne change pas un tarif, ne signes pas un contrat et n'envoies pas de devis final sans validation. Si le prospect n'est pas assez qualifié, tu transfères au prospection. Réponds en français avec : besoin compris, proposition de modules, lignes de devis suggérées, questions à lever, besoin ou non de validation, et éventuel transfert à l'Agent prospection.`,
  },
  prospecting: {
    key: "prospecting",
    label: "Agent prospection Cook Pilot",
    provider: "deepseek",
    model: "deepseek-v4-pro",
    systemPrompt: `Tu es l'Agent prospection de Cook Pilot. Tu crées, qualifies et scores les prospects, structures les informations disponibles, proposes une séquence de prise de contact et identifies le bon moment pour transmettre au commercial. Tu ne promets aucun prix ni condition commerciale et ne lances jamais de campagne ou d'envoi massif sans validation. Réponds en français avec : synthèse du prospect, score de qualification de 0 à 100 avec justification, prochaine action, brouillon de message éventuel, besoin ou non de validation, et condition de transfert à l'Agent commercial.`,
  },
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("COMMAND_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const originValue = allowed.includes(origin) ? origin : allowed[0] ?? "http://localhost:5173";

  return {
    "Access-Control-Allow-Origin": originValue,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function response(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function routeAgent(input: string): AgentKey {
  const value = input.toLocaleLowerCase("fr-FR");
  if (/(devis|quote|proposition|prix|abonnement|offre commerciale|contrat)/.test(value)) return "commercial";
  if (/(prospect|prospection|lead|démarch|qualification|prise de contact)/.test(value)) return "prospecting";
  if (/(bug|erreur|incident|api|intégration|déploi|scan bloqu|code|synchronisation)/.test(value)) return "technical";
  return "support";
}

async function callModel(agent: AgentDefinition, input: string, context: Record<string, unknown>) {
  const contextualInput = `Demande reçue :\n${input}\n\nContexte structuré :\n${JSON.stringify(context)}\n\nN'effectue aucune action externe. Prépare uniquement une réponse et des actions proposées.`;

  const endpoint = agent.provider === "zai_glm"
    ? "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    : "https://api.deepseek.com/chat/completions";
  const apiKey = agent.provider === "zai_glm"
    ? Deno.env.get("ZAI_GLM_API_KEY")
    : Deno.env.get("DEEPSEEK_API_KEY");
  const model = agent.provider === "zai_glm"
    ? Deno.env.get("ZAI_GLM_MODEL") ?? agent.model
    : Deno.env.get("DEEPSEEK_MODEL") ?? agent.model;

  if (!apiKey) {
    throw new Error(`Clé serveur absente pour ${agent.provider}`);
  }

  const body = agent.provider === "zai_glm"
    ? {
      model,
      messages: [
        { role: "system", content: agent.systemPrompt },
        { role: "user", content: contextualInput },
      ],
      temperature: 0.3,
      stream: false,
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    }
    : {
      model,
      messages: [
        { role: "system", content: agent.systemPrompt },
        { role: "user", content: contextualInput },
      ],
      stream: false,
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    };

  const result = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`Fournisseur IA indisponible (${result.status}) : ${detail.slice(0, 500)}`);
  }

  const payload = await result.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Le fournisseur IA n'a renvoyé aucun contenu exploitable");
  }

  return { content: content.trim(), model };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request) });
  if (request.method !== "POST") return response(request, { error: "Méthode non autorisée" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return response(request, { error: "Configuration Supabase incomplète" }, 500);
  }
  if (!authorization.startsWith("Bearer ")) {
    return response(request, { error: "Session utilisateur requise" }, 401);
  }

  let input: AgentRequest;
  try {
    input = await request.json();
  } catch {
    return response(request, { error: "Corps JSON invalide" }, 400);
  }

  const text = input.input?.trim();
  if (!uuidPattern.test(input.workspaceId ?? "") || !text || text.length > 12000) {
    return response(request, { error: "Demande agent invalide" }, 422);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response(request, { error: "Session invalide" }, 401);

  const { data: workspace } = await service
    .from("command_workspaces")
    .select("id, owner_user_id")
    .eq("id", input.workspaceId)
    .maybeSingle();
  const { data: member } = await service
    .from("command_workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (!workspace || (workspace.owner_user_id !== authData.user.id && !member)) {
    return response(request, { error: "Accès refusé au workspace" }, 403);
  }

  const agentKey = input.agentKey && agents[input.agentKey] ? input.agentKey : routeAgent(text);
  const agent = agents[agentKey];
  const source: Source = input.source === "voice" ? "voice" : "text";
  const startedAt = new Date().toISOString();

  const { data: voiceRequest, error: requestError } = await service
    .from("command_voice_requests")
    .insert({
      workspace_id: input.workspaceId,
      restaurant_id: input.restaurantId ?? null,
      requested_by_user_id: authData.user.id,
      source,
      transcript: text,
      assigned_agent_key: agentKey,
      risk_level: "medium",
      status: "processing",
      started_at: startedAt,
      normalized_intent: { agent_key: agentKey, route: "command-agent-router-v1" },
    })
    .select("id")
    .single();

  if (requestError || !voiceRequest) {
    return response(request, { error: "Impossible d'enregistrer la demande" }, 500);
  }

  const { data: run, error: runError } = await service
    .from("command_agent_runs")
    .insert({
      workspace_id: input.workspaceId,
      voice_request_id: voiceRequest.id,
      agent_key: agentKey,
      run_status: "running",
      risk_level: "medium",
      input_payload: {
        restaurant_id: input.restaurantId ?? null,
        lead_id: input.leadId ?? null,
        ticket_id: input.ticketId ?? null,
        quote_id: input.quoteId ?? null,
      },
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (runError || !run) {
    await service.from("command_voice_requests").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", voiceRequest.id);
    return response(request, { error: "Impossible de démarrer l'agent" }, 500);
  }

  try {
    const result = await callModel(agent, text, {
      restaurant_id: input.restaurantId ?? null,
      lead_id: input.leadId ?? null,
      ticket_id: input.ticketId ?? null,
      quote_id: input.quoteId ?? null,
      source,
    });
    const completedAt = new Date().toISOString();

    await Promise.all([
      service.from("command_agent_runs").update({
        run_status: "completed",
        output_payload: { content: result.content, model: result.model },
        completed_at: completedAt,
      }).eq("id", run.id),
      service.from("command_voice_requests").update({
        status: "completed",
        result_summary: result.content.slice(0, 1000),
        completed_at: completedAt,
      }).eq("id", voiceRequest.id),
      service.from("command_audit_log").insert({
        workspace_id: input.workspaceId,
        actor_type: "agent",
        agent_key: agentKey,
        event_type: "agent_response_generated",
        entity_type: "command_agent_run",
        entity_id: run.id,
        details: { provider: agent.provider, model: result.model, source },
      }),
    ]);

    return response(request, {
      voiceRequestId: voiceRequest.id,
      agentRunId: run.id,
      agent: { key: agentKey, label: agent.label, provider: agent.provider, model: result.model },
      content: result.content,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur agent inconnue";
    const completedAt = new Date().toISOString();
    await Promise.all([
      service.from("command_agent_runs").update({ run_status: "failed", error_message: message, completed_at: completedAt }).eq("id", run.id),
      service.from("command_voice_requests").update({ status: "failed", completed_at: completedAt }).eq("id", voiceRequest.id),
    ]);
    return response(request, { error: "L'agent n'a pas pu traiter la demande", detail: message }, 502);
  }
});
