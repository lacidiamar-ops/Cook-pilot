import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Command,
  FileText,
  Headphones,
  LayoutDashboard,
  Mail,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

type MissionStatus = "Diagnostic" | "Préparation" | "Analyse" | "Terminé";
type ApprovalStatus = "pending" | "approved" | "rejected";

type Mission = {
  id: string;
  icon: "technical" | "finance" | "success" | "journal";
  title: string;
  detail: string;
  status: MissionStatus;
};

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  }
}

const initialMissions: Mission[] = [
  {
    id: "SUP-1842",
    icon: "technical",
    title: "Connexion bloquée — La Fabrique Pizza",
    detail: "L’agent technique analyse la dernière erreur de session et le statut du compte.",
    status: "Diagnostic",
  },
  {
    id: "CS-044",
    icon: "success",
    title: "Rapport d’adoption mensuel",
    detail: "L’agent relation client identifie les restaurants à accompagner.",
    status: "Analyse",
  },
  {
    id: "FIN-032",
    icon: "finance",
    title: "Relances de paiement",
    detail: "L’agent finance prépare trois messages et isole les exceptions.",
    status: "Préparation",
  },
];

const voiceExamples = [
  "Agent technique, regarde pourquoi La Fabrique Pizza ne se connecte plus.",
  "Prépare les relances des factures impayées de plus de sept jours.",
  "Prépare un devis Gestion et HACCP pour Brasserie du Prado.",
  "Informe les clients HACCP de la mise à jour du scan DLC.",
];

function CookPilotMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "cp-mark cp-mark--compact" : "cp-mark"} aria-hidden="true">
      C<span className="cp-mark__dot cp-mark__dot--one" />
      <span className="cp-mark__dot cp-mark__dot--two" />
      <span className="cp-mark__dot cp-mark__dot--three" />
    </span>
  );
}

function MissionIcon({ type }: { type: Mission["icon"] }) {
  if (type === "finance") return <WalletCards size={18} />;
  if (type === "success") return <Sparkles size={18} />;
  if (type === "journal") return <Mail size={18} />;
  return <Headphones size={18} />;
}

function App() {
  const recognition = useRef<RecognitionLike | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState("Tu peux parler naturellement : je confie la demande au bon agent.");
  const [fallbackText, setFallbackText] = useState("");
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [selectedNav, setSelectedNav] = useState("Cockpit vocal");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");
  const [toast, setToast] = useState<string | null>(null);

  const approvalCopy = useMemo(() => {
    if (approvalStatus === "approved") {
      return {
        eyebrow: "VALIDÉ",
        title: "Réinitialisation autorisée",
        body: "L’agent technique peut appliquer uniquement la procédure approuvée puis informer le gérant.",
      };
    }
    if (approvalStatus === "rejected") {
      return {
        eyebrow: "REFUSÉ",
        title: "Action non autorisée",
        body: "Le ticket reste ouvert. L’agent technique poursuit son diagnostic sans modifier les accès.",
      };
    }
    return {
      eyebrow: "ACTION SENSIBLE",
      title: "Réinitialisation sécurisée proposée",
      body: "Session expirée probable pour le gérant de La Fabrique Pizza. Le compte est actif ; aucune anomalie de sécurité n’est détectée dans ce scénario de démonstration.",
    };
  }, [approvalStatus]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4200);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.rate = 0.98;
    window.speechSynthesis.speak(utterance);
  }

  function detectAgent(commandText: string): Mission["icon"] {
    const value = commandText.toLocaleLowerCase("fr-FR");
    if (/(facture|impay|paiement|relance|trésorerie)/.test(value)) return "finance";
    if (/(informe|journal|mise à jour|nouveauté|communique)/.test(value)) return "journal";
    if (/(adoption|formation|onboarding|utilise)/.test(value)) return "success";
    return "technical";
  }

  function detectLabel(type: Mission["icon"]) {
    if (type === "finance") return "Agent finance Cook Pilot";
    if (type === "journal") return "Agent information Cook Pilot";
    if (type === "success") return "Agent relation client Cook Pilot";
    return "Agent technique Cook Pilot";
  }

  function processCommand(rawText: string) {
    const text = rawText.trim();
    if (!text) return;

    const icon = detectAgent(text);
    const label = detectLabel(icon);
    const mission: Mission = {
      id: `CMD-${String(missions.length + 41).padStart(3, "0")}`,
      icon,
      title: `${label} prend en charge la demande`,
      detail: text,
      status: "Préparation",
    };

    setVoiceText(`« ${text} »`);
    setMissions((current) => [mission, ...current]);
    setFallbackText("");
    notify(`${label} a reçu ta demande. La mission est enregistrée et tracée.`);
    speak(`Amar, ${label} prend en charge la demande. Je te remonterai seulement les actions à valider.`);

    window.setTimeout(() => {
      setMissions((current) =>
        current.map((item) => (item.id === mission.id ? { ...item, status: "Analyse" } : item)),
      );
    }, 1250);
  }

  function startVoice() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      notify("La dictée navigateur n’est pas disponible ici. Utilise la saisie de secours.");
      return;
    }

    const instance = new Recognition();
    recognition.current = instance;
    instance.lang = "fr-FR";
    instance.interimResults = true;
    instance.continuous = false;
    instance.onstart = () => {
      setIsListening(true);
      setVoiceText("Je t’écoute…");
    };
    instance.onend = () => setIsListening(false);
    instance.onerror = () => {
      setIsListening(false);
      notify("Écoute interrompue. Tu peux relancer le micro ou utiliser la saisie de secours.");
    };
    instance.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setVoiceText(`« ${transcript} »`);
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) processCommand(transcript);
    };
    instance.start();
  }

  function toggleVoice() {
    if (isListening && recognition.current) {
      recognition.current.stop();
      return;
    }
    startVoice();
  }

  function decide(decision: "approved" | "rejected") {
    setApprovalStatus(decision);
    const approved = decision === "approved";
    const message = approved
      ? "Validation vocale enregistrée. L’agent peut appliquer la procédure autorisée."
      : "Action refusée. Le ticket reste ouvert et le diagnostic continue.";
    notify(message);
    speak(message);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <CookPilotMark />
          <div>
            <strong>Cook Pilot</strong>
            <span>COMMAND · VOICE FIRST</span>
          </div>
        </div>

        <div className="workspace-card">
          <span className="workspace-card__spark"><Sparkles size={15} /></span>
          <div>
            <strong>Poste de commandement</strong>
            <span>Amar · Fondateur</span>
          </div>
          <ChevronRight size={16} />
        </div>

        <nav className="nav-groups" aria-label="Navigation principale">
          <span className="nav-label">PILOTAGE</span>
          {[{ label: "Cockpit vocal", icon: Command }, { label: "Missions agents", icon: Bot }, { label: "À valider", icon: ShieldCheck, count: 1 }].map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={selectedNav === item.label ? "nav-item nav-item--active" : "nav-item"}
                key={item.label}
                onClick={() => setSelectedNav(item.label)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.count ? <em>{item.count}</em> : null}
              </button>
            );
          })}
          <span className="nav-label">OPÉRATIONS</span>
          {[{ label: "Restaurants", icon: UsersRound }, { label: "Support", icon: Ticket, count: 3 }, { label: "Journal", icon: FileText }, { label: "Finance", icon: WalletCards }].map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={selectedNav === item.label ? "nav-item nav-item--active" : "nav-item"}
                key={item.label}
                onClick={() => setSelectedNav(item.label)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.count ? <em className="nav-item__count nav-item__count--violet">{item.count}</em> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-status"><span /> Système de démonstration</div>
      </aside>

      <section className="main-canvas">
        <header className="topbar">
          <div className="breadcrumb"><span>Cook Pilot Command</span><ChevronRight size={15} /><strong>{selectedNav}</strong></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications"><Bell size={18} /><em>2</em></button>
            <div className="profile-chip"><div>AL</div><span><strong>Amar Lacidi</strong><small>Fondateur</small></span></div>
          </div>
        </header>

        <div className="content-area">
          <section className="page-heading">
            <div>
              <span className="eyebrow">POSTE DE COMMANDE VOCAL</span>
              <h1>Tu donnes l’ordre. Les agents exécutent.</h1>
              <p>Une interface pensée pour parler, contrôler et valider. Le clavier ne sert qu’en secours.</p>
            </div>
            <div className="status-chip"><span /> Orchestrateur disponible</div>
          </section>

          <section className="voice-grid">
            <motion.article className="voice-stage" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}>
              <div className="aurora aurora--one" /><div className="aurora aurora--two" />
              <span className="eyebrow eyebrow--light">ORDRE VOCAL</span>
              <h2>Parle naturellement.<br />La demande est distribuée au bon agent.</h2>
              <p>Chaque ordre crée une mission, une trace d’audit et une réponse claire. Les actions sensibles t’attendent dans la zone de validation.</p>

              <div className="voice-console">
                <motion.button
                  className={isListening ? "voice-button voice-button--listening" : "voice-button"}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleVoice}
                  aria-label={isListening ? "Arrêter l’écoute" : "Lancer l’écoute"}
                >
                  {isListening ? <Pause size={25} fill="currentColor" /> : <Mic size={26} />}
                </motion.button>
                <div className="voice-console__copy">
                  <strong>{isListening ? "Je t’écoute" : "Prêt à recevoir ton ordre"}</strong>
                  <span>{voiceText}</span>
                  <small>{isListening ? "Parle, puis arrête le micro." : "Exemple : « Agent technique, analyse les connexions. »"}</small>
                </div>
              </div>

              <form className="fallback-form" onSubmit={(event) => { event.preventDefault(); processCommand(fallbackText); }}>
                <input value={fallbackText} onChange={(event) => setFallbackText(event.target.value)} placeholder="Secours clavier : dicte ou écris une demande…" />
                <button type="submit"><Send size={15} /> Confier</button>
              </form>
              <div className="voice-examples">
                {voiceExamples.map((example) => <button key={example} type="button" onClick={() => processCommand(example)}>{example}</button>)}
              </div>
            </motion.article>

            <article className="agent-overview panel-card">
              <div className="section-heading"><div><span className="eyebrow">AGENTS</span><h2>Disponibles maintenant</h2></div><button className="text-action">Voir tout <ArrowUpRight size={15} /></button></div>
              {[{ icon: Headphones, label: "Agent technique", detail: "Incidents, support, accès", tone: "cyan" }, { icon: WalletCards, label: "Agent finance", detail: "Factures, relances, coûts", tone: "orange" }, { icon: Sparkles, label: "Agent relation client", detail: "Adoption et accompagnement", tone: "violet" }, { icon: Mail, label: "Agent information", detail: "Journal et mises à jour", tone: "blue" }].map((agent) => {
                const Icon = agent.icon;
                return <div className="agent-line" key={agent.label}><span className={`agent-line__icon agent-line__icon--${agent.tone}`}><Icon size={17} /></span><div><strong>{agent.label}</strong><small>{agent.detail}</small></div><span className="agent-line__status">Actif</span></div>;
              })}
            </article>
          </section>

          <section className="metric-grid">
            {[{ label: "Missions actives", value: String(missions.length), detail: "agents en traitement", icon: Activity, tone: "blue" }, { label: "Validations", value: approvalStatus === "pending" ? "1" : "0", detail: "décision attendue", icon: ShieldCheck, tone: "violet" }, { label: "Tickets support", value: "3", detail: "dont 1 prioritaire", icon: Ticket, tone: "red" }, { label: "Santé réseau", value: "98,7 %", detail: "sur 30 derniers jours", icon: RefreshCw, tone: "cyan" }].map((metric) => {
              const Icon = metric.icon;
              return <article className="metric-card" key={metric.label}><span className={`metric-card__icon metric-card__icon--${metric.tone}`}><Icon size={19} /></span><span className="metric-card__label">{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>;
            })}
          </section>

          <section className="operations-grid">
            <article className="panel-card missions-card">
              <div className="section-heading"><div><span className="eyebrow">MISSIONS</span><h2>Ce que les agents traitent</h2></div><button className="icon-button icon-button--plain"><MoreHorizontal size={19} /></button></div>
              <div className="mission-list">
                <AnimatePresence initial={false}>
                  {missions.map((mission) => <motion.div className="mission-row" key={mission.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }}><span className={`mission-row__icon mission-row__icon--${mission.icon}`}><MissionIcon type={mission.icon} /></span><div><strong>{mission.title}</strong><small>{mission.detail}</small><span className="mission-row__reference">{mission.id}</span></div><span className={`mission-row__status mission-row__status--${mission.status.toLocaleLowerCase("fr-FR").replace("é", "e")}`}>{mission.status}</span></motion.div>)}
                </AnimatePresence>
              </div>
            </article>

            <article className="panel-card approval-card">
              <div className="section-heading"><div><span className="eyebrow">À VALIDER PAR AMAR</span><h2>Une décision attend ton accord</h2></div><CircleAlert size={20} className="approval-card__alert" /></div>
              <div className={`approval-box approval-box--${approvalStatus}`}>
                <span className="approval-box__eyebrow">{approvalCopy.eyebrow}</span>
                <h3>{approvalCopy.title}</h3>
                <p>{approvalCopy.body}</p>
                {approvalStatus === "pending" ? <div className="approval-actions"><button className="button button--primary" onClick={() => decide("approved")}><Check size={16} /> Valider par la voix</button><button className="button button--danger" onClick={() => decide("rejected")}><X size={16} /> Refuser</button></div> : <button className="button button--secondary" onClick={() => setApprovalStatus("pending")}><RefreshCw size={15} /> Revoir la décision</button>}
              </div>
              <div className="approval-trace"><Clock3 size={15} /><span>La décision est rattachée à ta session et sera journalisée côté serveur.</span></div>
            </article>
          </section>

          <section className="panel-card journal-card">
            <div className="section-heading"><div><span className="eyebrow">JOURNAL DES ACTIONS</span><h2>Une trace claire de chaque ordre et décision</h2></div><button className="text-action">Ouvrir le journal <ChevronRight size={15} /></button></div>
            <div className="timeline">
              {[{ time: "09:18", title: "Ticket SUP-1842 créé", text: "Demande de connexion reçue depuis La Fabrique Pizza." }, { time: "09:16", title: "Relance F-2026-0042 préparée", text: "Brouillon disponible, envoi non effectué sans validation." }, { time: "09:05", title: "Information HACCP publiée", text: "Mise à jour ciblée envoyée aux responsables concernés." }].map((event) => <div className="timeline-row" key={event.time}><span className="timeline-row__dot" /><div><strong>{event.time} — {event.title}</strong><small>{event.text}</small></div></div>)}
            </div>
          </section>
        </div>
      </section>

      <AnimatePresence>{toast ? <motion.div className="toast" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}><Sparkles size={16} /><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Fermer"><X size={15} /></button></motion.div> : null}</AnimatePresence>
    </main>
  );
}

export default App;
