// src/components/workflow/AIAssistantPanel.tsx
// Conversational AI assistant with intent classification + module builder
// All LLM calls go through the Operator API backend (main.py) — no direct Ollama calls.
import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, Sparkles, Send, Loader2, Plus, Eye, Brain, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { API_CONFIG } from '@/config/api';
import { LibraryModule } from '@/services/libraryModuleService';
import { MitreTactic } from '@/types/opfor';

// ============================================================================
// Types
// ============================================================================

interface SearchResult {
  id: string; label: string; type: string; cluster: string;
  description: string; relevance_score: number;
  tactic?: string; riskLevel?: string; executionType?: string;
}

interface ElicitationState {
  active: boolean;
  stage: 'tactic' | 'execution' | 'generating';
  collected: Record<string, any>;
  originalQuery: string;
}

interface ElicitedModuleData {
  name: string; description: string; tactic: string; tacticId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  executionType: 'shell_command' | 'cobalt_strike' | 'robot_keyword' | 'ssh_command';
  command: string;
  parameters: Array<{ id: string; label: string; type: string; required: boolean }>;
  estimatedDuration: number; requiresC2: boolean; requiresElevated: boolean;
}

interface ChatEntry { role: 'user' | 'assistant'; content: string; }

interface Message {
  id: string; role: 'user' | 'assistant'; content: string; timestamp: Date;
  searchResults?: SearchResult[]; isSearching?: boolean;
  generatedModule?: LibraryModule; llmGenerated?: boolean;
  quickReplies?: Array<{ label: string; value: string }>;
}

interface Props {
  onAddToCanvas?: (module: LibraryModule) => void;
  onViewModule?: (module: LibraryModule) => void;
}

// ============================================================================
// Config — backend only, no direct Ollama
// ============================================================================

const OPERATOR_API = (() => {
  const base = API_CONFIG.BASE_URL || 'http://localhost:8000';
  return base.includes(':8000') ? base.replace(':8000', ':8001') : 'http://localhost:8001';
})();

const TACTICS = [
  { id: 'TA0043', label: 'Reconnaissance', icon: '🔭' },
  { id: 'TA0042', label: 'Resource Development', icon: '🏗️' },
  { id: 'TA0001', label: 'Initial Access', icon: '🚪' },
  { id: 'TA0002', label: 'Execution', icon: '⚡' },
  { id: 'TA0003', label: 'Persistence', icon: '🔒' },
  { id: 'TA0004', label: 'Privilege Escalation', icon: '👑' },
  { id: 'TA0005', label: 'Defense Evasion', icon: '🛡️' },
  { id: 'TA0006', label: 'Credential Access', icon: '🔑' },
  { id: 'TA0007', label: 'Discovery', icon: '🔍' },
  { id: 'TA0008', label: 'Lateral Movement', icon: '🚀' },
  { id: 'TA0009', label: 'Collection', icon: '📦' },
  { id: 'TA0011', label: 'Command & Control', icon: '📡' },
  { id: 'TA0010', label: 'Exfiltration', icon: '📤' },
  { id: 'TA0040', label: 'Impact', icon: '💥' },
  { id: 'control', label: 'Control Flow', icon: '⚙️' },
];

const tacticCfg: Record<string, { label: string; icon: string; color: string }> = Object.fromEntries(
  TACTICS.map(t => [t.id, { label: t.label, icon: t.icon,
    color: ({ TA0043:'text-sky-400',TA0042:'text-teal-400',TA0001:'text-blue-400',
      TA0002:'text-orange-400',TA0003:'text-purple-400',TA0004:'text-pink-400',
      TA0005:'text-indigo-400',TA0006:'text-red-400',TA0007:'text-green-400',
      TA0008:'text-purple-400',TA0009:'text-cyan-400',TA0011:'text-yellow-400',
      TA0010:'text-emerald-400',TA0040:'text-red-500',control:'text-zinc-400',
    } as Record<string,string>)[t.id] || 'text-zinc-400',
  }])
);

const riskColors: Record<string,string> = {
  critical:'text-red-500 bg-red-500/10 border-red-500/30',
  high:'text-orange-500 bg-orange-500/10 border-orange-500/30',
  medium:'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
  low:'text-green-500 bg-green-500/10 border-green-500/30',
};

// ============================================================================
// Intent Classification (heuristic — no LLM call needed)
// ============================================================================

type UserIntent =
  | 'conversation'       // pure chat, greetings, meta questions
  | 'tactical_question'  // question ABOUT a tactic/tool — LLM answers first, then offers search/build
  | 'capability'         // terse noun-phrase describing a capability — search library
  | 'build_request'      // explicit "build me a module"
  | 'ambiguous';         // unclear — search library, ask before building

const GREETING_PATTERNS = [
  /^(hi|hey|hello|yo|sup|what'?s up|howdy|good\s*(morning|afternoon|evening))[\s!?.]*$/i,
  /^(thanks|thank you|ty|thx|cheers)[\s!?.]*$/i,
];

/** Short affirmations — handled contextually, not as a fixed intent */
const AFFIRMATION_PATTERNS = [
  /^(yes|yeah|yep|yea|ok|okay|sure|cool|nice|great|awesome|perfect|got it|understood|do it|let'?s go|go ahead|y)[\s!?.]*$/i,
];

const META_PATTERNS = [
  /^(what|who)\s+(are you|is this|can you)/i,
  /^(how|what)\s+(do|does|can|should)\s+(this|i|you|it|we)/i,
  /^(help|help me|what can you do|show me|explain)/i,
  /^(can you|could you|would you)\s+(help|explain|tell|show)/i,
];

const BUILD_PATTERNS = [
  /\b(build|create|make|generate|add)\s+(a\s+)?(new\s+)?(module|node|step|block)/i,
  /\b(i need|i want|we need)\s+(a\s+)?(new\s+)?(module|node|capability)/i,
  /\bnew module\b/i,
];

/**
 * Detects QUESTIONS — "what options...", "how do I...", "can I...", "what about..."
 * These should be answered conversationally even when they contain tactical keywords.
 */
const QUESTION_PATTERNS = [
  /^(what|which|how|can|could|would|is there|are there|do you|does|tell me)\b/i,
  /^(what'?s|how'?s|where'?s)\b/i,
  /^(how about|what about|any)\b/i,
  /\?$/,  // ends with question mark
];

const TACTICAL_KEYWORDS = new Set([
  'credential', 'credentials', 'cred', 'creds', 'mimikatz', 'kerberoast', 'kerberoasting',
  'golden', 'silver', 'ticket', 'lsass', 'hashdump', 'hash', 'hashes', 'ntlm', 'sam', 'secretsdump',
  'lateral', 'psexec', 'wmi', 'winrm', 'dcom', 'smbexec', 'atexec',
  'beacon', 'payload', 'stager', 'listener', 'dropper', 'implant', 'agent',
  'c2', 'cobalt', 'cobaltstrike', 'koadic', 'sliver', 'metasploit', 'meterpreter',
  'persistence', 'registry', 'scheduled', 'service', 'autorun', 'startup',
  'privilege', 'escalation', 'privesc', 'uac', 'bypass', 'getsystem', 'runas',
  'evasion', 'obfuscation', 'amsi', 'etw', 'unhook', 'inject', 'injection',
  'recon', 'reconnaissance', 'enum', 'enumeration', 'bloodhound', 'sharphound',
  'discovery', 'whoami', 'getuid', 'ipconfig', 'netstat', 'arp',
  'exfil', 'exfiltration', 'upload', 'download', 'transfer', 'scp', 'ssh',
  'phishing', 'spearphishing', 'macro', 'hta', 'lnk', 'iso',
  'dump', 'extract', 'harvest', 'scrape', 'capture', 'keylog', 'keylogger',
  'scan', 'nmap', 'portscan', 'sweep',
  'pivot', 'tunnel', 'proxy', 'socks', 'portfwd',
  'exploit', 'vuln', 'vulnerability', 'cve', 'rce', 'lpe',
  'shell', 'reverse', 'bind', 'webshell', 'powershell', 'cmd',
  'ad', 'domain', 'dc', 'gpo', 'dcsync',
  'token', 'impersonate', 'pth', 'ptt',
  'cleanup', 'teardown', 'teamserver',
  'impacket', 'rubeus', 'certify', 'certipy', 'sharphound',
]);

const MITRE_ID_PATTERN = /\b[Tt]\d{4}(\.\d{3})?\b/;
const TACTIC_ID_PATTERN = /\bTA\d{4}\b/;

function classifyIntent(text: string): UserIntent {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const words = lower.replace(/[?!.,;:'"]/g, '').split(/\s+/).filter(Boolean);

  // 1. Pure greetings / meta — always conversation
  if (GREETING_PATTERNS.some(p => p.test(trimmed))) return 'conversation';
  if (META_PATTERNS.some(p => p.test(trimmed))) return 'conversation';

  // 2. Short non-tactical input (1-2 words without tactical keywords) — conversation
  if (words.length <= 2) {
    const hasTactical = words.some(w => TACTICAL_KEYWORDS.has(w));
    const hasMitre = MITRE_ID_PATTERN.test(trimmed) || TACTIC_ID_PATTERN.test(trimmed);
    if (!hasTactical && !hasMitre) return 'conversation';
    // Short tactical phrase (e.g. "golden ticket", "mimikatz") — treat as capability search
    if (hasTactical && !QUESTION_PATTERNS.some(p => p.test(trimmed))) return 'capability';
  }

  // 3. Explicit build request — always build
  if (BUILD_PATTERNS.some(p => p.test(trimmed))) return 'build_request';

  const tacticalHits = words.filter(w => TACTICAL_KEYWORDS.has(w)).length;
  const isQuestion = QUESTION_PATTERNS.some(p => p.test(trimmed));

  // 4. QUESTIONS containing tactical keywords → tactical_question
  //    "What options do I have to run mimikatz" → LLM answers, then offers search/build
  //    "How about credential dumping with koadic c2" → LLM answers, then offers search/build
  if (isQuestion && tacticalHits >= 1) return 'tactical_question';

  // 5. MITRE IDs → capability search
  if (MITRE_ID_PATTERN.test(trimmed) || TACTIC_ID_PATTERN.test(trimmed)) return 'capability';

  // 6. Dense tactical noun-phrases (not questions) → capability search
  if (tacticalHits >= 2) return 'capability';
  if (tacticalHits === 1 && words.length <= 5 && !isQuestion) return 'capability';
  if (tacticalHits === 1 && words.length > 5) return 'ambiguous';

  // 7. Non-tactical questions → conversation
  if (isQuestion && tacticalHits === 0) return 'conversation';

  // 8. Longer non-tactical input → conversation
  if (words.length > 3 && tacticalHits === 0) return 'conversation';

  return 'ambiguous';
}

/**
 * Extract the tactical "topic" from a message, stripping question framing.
 * "What options do I have to run mimikatz" → "mimikatz"
 * "How about credential dumping with koadic c2" → "credential dumping koadic c2"
 * "No what about golden ticket" → "golden ticket"
 */
function extractTacticalTopic(text: string): string {
  let cleaned = text.trim();
  // Strip rejection prefixes
  cleaned = cleaned.replace(/^(no+|nah|nope)[,.]?\s*/i, '');
  // Strip question framing
  cleaned = cleaned.replace(/^(what|how|tell me)\s+(options?|ways?|methods?|about)\s+(do i have\s+)?(to\s+)?(run|use|do|for|with)?\s*/i, '');
  cleaned = cleaned.replace(/^(what about|how about|any)\s*/i, '');
  cleaned = cleaned.replace(/^(can i|could i|how do i|how to)\s*/i, '');
  cleaned = cleaned.replace(/\?+$/, '');
  return cleaned.trim();
}

// ============================================================================
// Rejection detection — now extracts the NEW topic if present
// ============================================================================

const REJECTION_PATTERNS = [
  /^no\b/i, /not what/i, /don'?t work/i, /wrong/i, /that'?s not/i,
  /none of/i, /doesn'?t help/i, /not right/i, /not those/i, /nope/i,
  /try again/i, /something else/i, /not useful/i,
];
const isRejection = (t: string) => REJECTION_PATTERNS.some(p => p.test(t.trim()));

/**
 * When a user rejects results AND provides a new topic in the same message,
 * extract that new topic instead of re-using the stale lastSearchQuery.
 * "No what about golden ticket" → { rejected: true, newTopic: "golden ticket" }
 * "No" → { rejected: true, newTopic: null }
 */
function parseRejection(text: string): { rejected: boolean; newTopic: string | null } {
  const trimmed = text.trim();
  if (!isRejection(trimmed)) return { rejected: false, newTopic: null };

  // Strip the rejection prefix to find any new topic
  let remainder = trimmed
    .replace(/^(no+|nah|nope|wrong|not (what|right|those|useful|it))[,.]?\s*/i, '')
    .replace(/^(what about|how about|try|instead|i (want|need|meant))\s*/i, '')
    .trim();

  if (!remainder || remainder.length < 2) return { rejected: true, newTopic: null };

  // Check if the remainder contains tactical content
  const words = remainder.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/\s+/).filter(Boolean);
  const hasTactical = words.some(w => TACTICAL_KEYWORDS.has(w));
  if (hasTactical || MITRE_ID_PATTERN.test(remainder)) {
    return { rejected: true, newTopic: remainder };
  }

  // Even without tactical keywords, if it's a short phrase it's probably a new topic
  if (words.length <= 5) return { rejected: true, newTopic: remainder };

  return { rejected: true, newTopic: null };
}

// ============================================================================
// Stop words for search
// ============================================================================

const STOP = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'do','does','did','have','has','had','having','will','would','shall','should',
  'can','could','may','might','must','need','dare',
  'i','me','my','we','our','you','your','it','its','he','she','they','them',
  'this','that','these','those','what','which','who','whom','how','where','when','why',
  'not','no','nor','but','or','and','if','then','so','too','also',
  'for','with','about','from','into','to','of','on','in','at','by','up',
  'any','some','all','each','every','both','few','more','most','other',
  'anything','something','there','here','just','only','very','really',
  'get','got','run','use','make','find','show','give','help','try','want',
]);

// ============================================================================
// Conversation fallback (when LLM is unavailable)
// ============================================================================

function getConversationFallback(text: string): string {
  const lower = text.toLowerCase().trim();
  if (GREETING_PATTERNS.some(p => p.test(text))) {
    return "Hey! Describe a capability you need, or search for an existing module.";
  }
  if (/what can you do|help|how does this work/i.test(lower)) {
    return "I can search the module library for existing attack steps, or help you build a new module if one doesn't exist yet. Try describing a capability like \"credential dumping via LSASS\" or \"lateral movement with PsExec.\"";
  }
  if (/thank/i.test(lower)) {
    return "Anytime. Let me know if you need anything else.";
  }
  return "I'm here to help find or build attack modules. Try describing what you need, like \"dump credentials\" or \"move laterally with PsExec.\"";
}

// ============================================================================
// Main Component
// ============================================================================

export function AIAssistantPanel({ onAddToCanvas, onViewModule }: Props) {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome', role: 'assistant',
    content: "Hey, I can search the module library, help you build new modules, or just answer questions. What do you need?",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState<boolean | null>(null);
  const [elicitation, setElicitation] = useState<ElicitationState>({
    active: false, stage: 'tactic', collected: {}, originalQuery: '',
  });
  const [pendingBuildQuery, setPendingBuildQuery] = useState<string | null>(null);
  const lastSearchQuery = useRef('');
  const lastTacticalTopic = useRef<string | null>(null);  // tracks topic after tactical_question LLM response
  const chatHistory = useRef<ChatEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { checkLLM(); }, []);

  // ── LLM connectivity (backend only) ───────────────────────
  const checkLLM = useCallback(async () => {
    try {
      const r = await fetch(`${OPERATOR_API}/api/chat/status`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) { setLlmAvailable((await r.json()).available); return; }
    } catch { /* backend not reachable */ }
    setLlmAvailable(false);
  }, []);

  const chatWithLLM = useCallback(async (msg: string): Promise<string> => {
    const r = await fetch(`${OPERATOR_API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory.current.slice(-20) }),
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => r.statusText);
      throw new Error(`LLM error ${r.status}: ${detail}`);
    }
    return (await r.json()).reply;
  }, []);

  const pushHistory = useCallback((role: 'user' | 'assistant', content: string) => {
    chatHistory.current.push({ role, content });
    if (chatHistory.current.length > 30) chatHistory.current = chatHistory.current.slice(-30);
  }, []);

  // ── Library search ────────────────────────────────────────
  const extractKW = useCallback((raw: string) =>
    raw.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w))
  , []);

  const scoreModule = useCallback((mod: any, kws: string[]) => {
    const n = (mod.name || '').toLowerCase();
    const d = (mod.description || '').toLowerCase();
    const k = (mod._key || '').toLowerCase();
    const cat = (mod.category || '').toLowerCase();
    let s = 0;
    for (const kw of kws) {
      const nw = n.split(/[\s\-_/]+/);
      if (nw.some((w: string) => w === kw || w.startsWith(kw))) s += 5;
      else if (n.includes(kw)) s += 3;
      if (k.split(/[\s\-_/]+/).some((w: string) => w === kw || w.startsWith(kw))) s += 4;
      if (d.split(/[\s\-_/.,;:]+/).some((w: string) => w === kw || w.startsWith(kw))) s += 2;
      else if (d.includes(kw)) s += 1;
      if (cat.includes(kw)) s += 2;
    }
    return s;
  }, []);

  const searchLibrary = useCallback(async (query: string): Promise<SearchResult[]> => {
    const kws = extractKW(query);
    if (kws.length === 0) return [];
    const toResult = (x: any, score: number): SearchResult => ({
      id: x._id || `LibraryModule/${x._key}`,
      label: x.name,
      type: 'LibraryModule',
      cluster: x.tactic || 'control',
      description: x.description || '',
      relevance_score: score,
      tactic: x.tactic,
      riskLevel: x.riskLevel,
      executionType: x.executionType,
    });
    // Try server-side search
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/library-modules?search=${encodeURIComponent(kws.join(' '))}&limit=10`);
      if (r.ok) {
        const data = await r.json();
        const mods = data.modules || data.data || [];
        const scored = mods.map((x: any) => ({ x, s: scoreModule(x, kws) })).filter((v: any) => v.s >= 3);
        if (scored.length > 0) {
          return scored.sort((a: any, b: any) => b.s - a.s).slice(0, 5).map((v: any) => toResult(v.x, v.s));
        }
      }
    } catch { /* fall through to client-side */ }
    // Fallback: fetch all and score client-side
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/library-modules?limit=500`);
      if (r.ok) {
        const all = (await r.json()).modules || [];
        return all
          .map((m: any) => ({ x: m, s: scoreModule(m, kws) }))
          .filter((v: any) => v.s >= 3)
          .sort((a: any, b: any) => b.s - a.s)
          .slice(0, 5)
          .map((v: any) => toResult(v.x, v.s));
      }
    } catch { /* no results */ }
    return [];
  }, [extractKW, scoreModule]);

  const fetchModuleDetails = useCallback(async (id: string): Promise<LibraryModule | null> => {
    try {
      const k = id.includes('/') ? id.split('/')[1] : id;
      const r = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.MODULE_DETAIL(k)}`);
      return (await r.json()).module;
    } catch { return null; }
  }, []);

  // ── Helpers ───────────────────────────────────────────────
  const addMsg = useCallback((content: string, extras?: Partial<Message>) => {
    setMessages(p => [...p, {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant' as const,
      content,
      timestamp: new Date(),
      ...extras,
    }]);
    pushHistory('assistant', content);
  }, [pushHistory]);

  // ── Build Module from elicited data ───────────────────────
  const buildModule = useCallback((d: ElicitedModuleData): LibraryModule => {
    const key = `ai_${(d.name || 'mod').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
    const t = TACTICS.find(x => x.id === d.tacticId);
    return {
      _key: key,
      _id: `LibraryModule/${key}`,
      name: d.name || 'Custom Module',
      description: d.description || '',
      tactic: (d.tacticId || 'control') as MitreTactic,
      category: t?.label || 'Custom',
      subcategory: '',
      riskLevel: d.riskLevel || 'medium',
      executionType: d.executionType || 'shell_command',
      icon: t?.icon || '🤖',
      estimatedDuration: d.estimatedDuration || 30,
      inputs: [{ id: 'trigger-in', label: 'Trigger', type: 'trigger' }],
      outputs: [{ id: 'trigger-out', label: 'Next', type: 'trigger' }],
      parameters: d.parameters || [],
      shellCommand: d.executionType === 'shell_command' ? d.command : undefined,
      cobaltStrikeCommand: d.executionType === 'cobalt_strike' ? d.command : undefined,
      requirements: { c2Server: d.requiresC2, elevated: d.requiresElevated },
      metadata: {
        generatedBy: 'ai_assistant',
        generatedAt: new Date().toISOString(),
        status: 'requirement',
        requestedCapability: d.description,
      },
    } as LibraryModule;
  }, []);

  // ── Parse LLM structured response ────────────────────────
  const parseLLMModule = useCallback((reply: string, query: string, tactic: string, tacticId: string, exec: ElicitedModuleData['executionType']): ElicitedModuleData => {
    const getField = (f: string) => {
      const m = new RegExp(`^${f}:\\s*(.+)$`, 'im').exec(reply);
      return m ? m[1].trim() : '';
    };
    const name = getField('NAME') || query.split(/\s+/).slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    const risk = (['low', 'medium', 'high', 'critical'].includes(getField('RISK').toLowerCase()) ? getField('RISK').toLowerCase() : 'medium') as ElicitedModuleData['riskLevel'];
    const command = getField('COMMAND') || '';
    const description = getField('DESCRIPTION') || query;
    const paramStr = getField('PARAMS');
    const params: ElicitedModuleData['parameters'] = [];
    const seen = new Set<string>();
    let match;
    const re = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
    while ((match = re.exec(command)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        params.push({
          id: match[1].toLowerCase(),
          label: match[1].split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
          type: 'string',
          required: true,
        });
      }
    }
    if (params.length === 0 && paramStr) {
      paramStr.split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
        const id = p.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (!seen.has(id)) {
          seen.add(id);
          params.push({ id, label: p, type: 'string', required: true });
        }
      });
    }
    return {
      name, description, tactic, tacticId, riskLevel: risk, executionType: exec,
      command, parameters: params, estimatedDuration: 30,
      requiresC2: exec === 'cobalt_strike', requiresElevated: false,
    };
  }, []);

  // ── Conversational response ───────────────────────────────
  const handleConversation = useCallback(async (text: string) => {
    lastTacticalTopic.current = null;  // clear tactical context on pure conversation
    setIsLoading(true);
    if (llmAvailable) {
      try {
        const reply = await chatWithLLM(text);
        addMsg(reply);
      } catch {
        addMsg(getConversationFallback(text));
      }
    } else {
      addMsg(getConversationFallback(text));
    }
    setIsLoading(false);
  }, [llmAvailable, chatWithLLM, addMsg]);

  // ── Tactical question: LLM answers first, then offers search/build ──
  const handleTacticalQuestion = useCallback(async (text: string) => {
    const topic = extractTacticalTopic(text);
    lastTacticalTopic.current = topic || text;
    setIsLoading(true);

    if (llmAvailable) {
      try {
        const reply = await chatWithLLM(text);
        // After the LLM answer, offer to search or build
        addMsg(reply, {
          quickReplies: [
            { label: '🔍 Search library', value: `__search__:${topic || text}` },
            { label: '🛠️ Build a module', value: `__build_topic__:${topic || text}` },
          ],
        });
      } catch {
        // Fallback: just search the library for the topic
        addMsg(`Let me search the library for "${topic || text}"...`);
        lastSearchQuery.current = topic || text;
        await doLibrarySearch(topic || text);
      }
    } else {
      // No LLM — go straight to library search
      lastSearchQuery.current = topic || text;
      await doLibrarySearch(topic || text);
    }
    setIsLoading(false);
  }, [llmAvailable, chatWithLLM, addMsg]);

  // ── Elicitation (3-step: tactic → exec type → generate) ──
  const startElicitation = useCallback(async (query: string) => {
    setElicitation({ active: true, stage: 'tactic', collected: { description: query }, originalQuery: query });
    setIsLoading(true);
    try {
      const reply = await chatWithLLM(
        `The operator needs: "${query}"\n\nIn 1 sentence, describe this capability and the MITRE ATT&CK technique ID. No JSON.`
      );
      pushHistory('assistant', reply);
      addMsg(`${reply}\n\nWhich ATT&CK tactic?`, {
        quickReplies: TACTICS.slice(0, 12).map(t => ({ label: `${t.icon} ${t.label}`, value: t.id })),
      });
    } catch {
      addMsg("Which ATT&CK tactic does this fall under?", {
        quickReplies: TACTICS.slice(0, 12).map(t => ({ label: `${t.icon} ${t.label}`, value: t.id })),
      });
    } finally {
      setIsLoading(false);
    }
  }, [chatWithLLM, addMsg, pushHistory]);

  const handleElicitationStep = useCallback(async (userInput: string) => {
    const { stage, collected, originalQuery } = elicitation;

    if (stage === 'tactic') {
      const m = TACTICS.find(t => t.id === userInput || t.label.toLowerCase() === userInput.toLowerCase());
      setElicitation(p => ({
        ...p,
        stage: 'execution',
        collected: { ...p.collected, tactic: m?.label || userInput, tacticId: m?.id || 'control' },
      }));
      addMsg(`${m?.icon || '⚡'} ${m?.label || userInput}. How will this execute?`, {
        quickReplies: [
          { label: '🖥️ Shell Command', value: 'shell_command' },
          { label: '🎯 Cobalt Strike', value: 'cobalt_strike' },
          { label: '🤖 Robot Keyword', value: 'robot_keyword' },
          { label: '🔌 SSH Command', value: 'ssh_command' },
        ],
      });
    } else if (stage === 'execution') {
      const exec = userInput as ElicitedModuleData['executionType'];
      const tacticLabel = collected.tactic || 'unknown';
      const tacticId = collected.tacticId || 'control';
      setElicitation(p => ({ ...p, stage: 'generating' }));
      setIsLoading(true);

      try {
        const prompt = [
          `Generate a module for: "${originalQuery}"`,
          `Tactic: ${tacticLabel}, Execution: ${exec}`,
          '',
          'Reply in EXACTLY this format (no markdown, no extra text):',
          'NAME: <3-5 word module name>',
          'RISK: <low|medium|high|critical>',
          'COMMAND: <command template using ${PARAM_NAME} for variables>',
          'PARAMS: <comma-separated parameter names>',
          'DESCRIPTION: <1 sentence>',
        ].join('\n');

        const reply = await chatWithLLM(prompt);
        pushHistory('assistant', reply);
        const parsed = parseLLMModule(reply, originalQuery, tacticLabel, tacticId, exec);
        const mod = buildModule(parsed);
        addMsg(`Built "${mod.name}" — review and add to canvas:`, { generatedModule: mod, llmGenerated: true });
      } catch {
        const fallbackName = originalQuery.split(/\s+/).slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        const mod = buildModule({
          name: fallbackName, description: originalQuery, tactic: tacticLabel, tacticId,
          riskLevel: 'medium', executionType: exec, command: '', parameters: [],
          estimatedDuration: 30, requiresC2: exec === 'cobalt_strike', requiresElevated: false,
        });
        addMsg(`Built "${mod.name}" — add to canvas and configure in Node Config:`, { generatedModule: mod, llmGenerated: true });
      } finally {
        setIsLoading(false);
        setElicitation({ active: false, stage: 'tactic', collected: {}, originalQuery: '' });
      }
    }
  }, [elicitation, chatWithLLM, addMsg, pushHistory, parseLLMModule, buildModule]);

  // ── Library search (extracted for reuse) ──────────────────
  const doLibrarySearch = useCallback(async (query: string) => {
    lastSearchQuery.current = query;
    const sid = `s-${Date.now()}`;
    setMessages(p => [...p, { id: sid, role: 'assistant', content: 'Searching...', timestamp: new Date(), isSearching: true }]);
    setIsLoading(true);
    try {
      const results = await searchLibrary(query);
      if (results.length > 0) {
        const content = `Found ${results.length} matching module${results.length > 1 ? 's' : ''}:`;
        setMessages(p => p.map(m => m.id === sid ? { ...m, content, isSearching: false, searchResults: results } : m));
        pushHistory('assistant', content);
      } else {
        // No results — offer to build with the TOPIC as the module name, not the raw question
        const topic = extractTacticalTopic(query) || query;
        setMessages(p => p.map(m => m.id === sid ? {
          ...m,
          content: `Nothing in the library matches "${topic}". Want me to build a module for it?`,
          isSearching: false,
          quickReplies: [
            { label: '✅ Yes, build it', value: '__confirm_build__' },
            { label: '❌ No thanks', value: '__cancel_build__' },
          ],
        } : m));
        pushHistory('assistant', `No library match for "${topic}". Offered to build.`);
        setPendingBuildQuery(topic);
      }
    } catch {
      setMessages(p => p.map(m => m.id === sid ? { ...m, content: 'Search failed — try again?', isSearching: false } : m));
    }
    setIsLoading(false);
  }, [searchLibrary, pushHistory]);

  // ── Handle Send (with intent classification) ──────────────
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setMessages(p => [...p, { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date() }]);
    pushHistory('user', text);
    setInput('');

    // If elicitation is active, continue that flow
    if (elicitation.active) {
      await handleElicitationStep(text);
      return;
    }

    // If we are waiting for user to confirm "build it?"
    if (pendingBuildQuery) {
      const isYes = /^(yes|yeah|yep|yea|sure|ok|okay|do it|build it|go ahead|y)[\s!.]*$/i.test(text.toLowerCase().trim());
      const isNo = /^(no|nah|nope|never mind|cancel|skip|n)[\s!.]*$/i.test(text.toLowerCase().trim());
      if (isYes) {
        const query = pendingBuildQuery;
        setPendingBuildQuery(null);
        await startElicitation(query);
        return;
      } else if (isNo) {
        setPendingBuildQuery(null);
        addMsg("No worries. Let me know if you need anything else.");
        return;
      }
      // Neither yes nor no — fall through to normal classification
      setPendingBuildQuery(null);
    }

    // ── Affirmation after a tactical LLM answer ──
    // If the user says "yes" / "do it" after we explained a tactic, transition to build
    if (lastTacticalTopic.current && AFFIRMATION_PATTERNS.some(p => p.test(text))) {
      const topic = lastTacticalTopic.current;
      lastTacticalTopic.current = null;
      addMsg(`Got it — let's build a "${topic}" module.`);
      await startElicitation(topic);
      return;
    }

    // ── Rejection of previous search results ──
    const rejection = parseRejection(text);
    if (rejection.rejected && lastSearchQuery.current) {
      if (rejection.newTopic) {
        // User rejected AND provided a new topic — search/ask about the NEW topic
        lastTacticalTopic.current = null;
        const newIntent = classifyIntent(rejection.newTopic);
        if (newIntent === 'tactical_question') {
          await handleTacticalQuestion(rejection.newTopic);
        } else {
          await doLibrarySearch(rejection.newTopic);
        }
      } else {
        // Pure rejection, no new topic — offer to build the last topic
        const topic = extractTacticalTopic(lastSearchQuery.current) || lastSearchQuery.current;
        addMsg(`Got it — want me to build a "${topic}" module from scratch?`, {
          quickReplies: [
            { label: '✅ Yes, build it', value: '__confirm_build__' },
            { label: '❌ No thanks', value: '__cancel_build__' },
          ],
        });
        setPendingBuildQuery(topic);
      }
      return;
    }

    // ── Intent Classification ──
    const intent = classifyIntent(text);

    if (intent === 'conversation') {
      await handleConversation(text);
      return;
    }

    if (intent === 'tactical_question') {
      await handleTacticalQuestion(text);
      return;
    }

    if (intent === 'build_request') {
      const capability = text
        .replace(/^(build|create|make|generate|add)\s+(a\s+)?(new\s+)?(module|node|step|block)\s*(for|to|that|which)?\s*/i, '')
        .replace(/^(i need|i want|we need)\s+(a\s+)?(new\s+)?(module|node|capability)\s*(for|to|that|which)?\s*/i, '')
        .trim();
      await startElicitation(capability || text);
      return;
    }

    // capability or ambiguous — search library first, ask before building
    lastTacticalTopic.current = null;
    await doLibrarySearch(text);
  }, [input, isLoading, elicitation, pendingBuildQuery, doLibrarySearch, handleElicitationStep, startElicitation, handleConversation, handleTacticalQuestion, addMsg, pushHistory]);

  const handleQuickReply = useCallback(async (value: string, label: string) => {
    setMessages(p => [...p, { id: `u-${Date.now()}`, role: 'user', content: label, timestamp: new Date() }]);
    pushHistory('user', label);

    if (value === '__confirm_build__' && pendingBuildQuery) {
      const query = pendingBuildQuery;
      setPendingBuildQuery(null);
      await startElicitation(query);
      return;
    }
    if (value === '__cancel_build__') {
      setPendingBuildQuery(null);
      addMsg("No worries. Let me know if you need anything else.");
      return;
    }

    // Quick reply from tactical_question: "Search library" or "Build a module"
    if (value.startsWith('__search__:')) {
      const topic = value.replace('__search__:', '');
      lastTacticalTopic.current = null;
      await doLibrarySearch(topic);
      return;
    }
    if (value.startsWith('__build_topic__:')) {
      const topic = value.replace('__build_topic__:', '');
      lastTacticalTopic.current = null;
      await startElicitation(topic);
      return;
    }

    if (elicitation.active) await handleElicitationStep(value);
  }, [elicitation, pendingBuildQuery, handleElicitationStep, startElicitation, doLibrarySearch, addMsg, pushHistory]);

  // ── Canvas Actions ────────────────────────────────────────
  const handleAddToCanvas = useCallback(async (r: SearchResult) => {
    const mod = await fetchModuleDetails(r.id);
    if (mod && onAddToCanvas) { onAddToCanvas(mod); addMsg(`Added "${r.label}" to canvas.`); }
  }, [fetchModuleDetails, onAddToCanvas, addMsg]);

  const handleAddGenerated = useCallback((mod: LibraryModule) => {
    if (onAddToCanvas) { onAddToCanvas(mod); addMsg(`Added "${mod.name}" to canvas. Configure in Node Config panel.`); }
  }, [onAddToCanvas, addMsg]);

  const handleView = useCallback(async (r: SearchResult) => {
    const mod = await fetchModuleDetails(r.id);
    if (mod && onViewModule) onViewModule(mod);
  }, [fetchModuleDetails, onViewModule]);

  const handleBuildCustom = useCallback(async () => {
    const q = lastSearchQuery.current || [...messages].reverse().find(m => m.role === 'user')?.content;
    if (q) {
      addMsg(`Want me to build a module for "${q}"?`, {
        quickReplies: [
          { label: '✅ Yes, build it', value: '__confirm_build__' },
          { label: '❌ No thanks', value: '__cancel_build__' },
        ],
      });
      setPendingBuildQuery(q);
    }
  }, [messages, addMsg]);

  const quickActions = [
    { label: 'Credential Dumping', query: 'dump credentials LSASS' },
    { label: 'Lateral Movement', query: 'lateral movement PSExec' },
    { label: 'Discovery', query: 'domain enumeration discovery' },
    { label: 'Persistence', query: 'persistence registry scheduled task' },
  ];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="px-4 py-3 border-b border-panel-border bg-zinc-950/50">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          Module Assistant
          <div className="ml-auto flex items-center gap-1.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              llmAvailable === true ? "bg-green-500" : llmAvailable === false ? "bg-zinc-600" : "bg-yellow-500 animate-pulse"
            )} />
            <span className="text-[9px] text-zinc-500 font-mono">
              {llmAvailable === true ? 'AI' : llmAvailable === false ? 'SEARCH' : '...'}
            </span>
          </div>
        </h3>
        <p className="text-[10px] text-muted-foreground mt-1 ml-8">Search, chat, or build modules</p>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {messages.map(m => (
            <MsgBubble
              key={m.id}
              msg={m}
              onAddToCanvas={handleAddToCanvas}
              onView={handleView}
              onBuildCustom={handleBuildCustom}
              onAddGenerated={handleAddGenerated}
              onQuickReply={handleQuickReply}
            />
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />
                  <span className="text-xs text-zinc-500">
                    {elicitation.active ? 'Generating module...' : 'Thinking...'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {messages.length <= 1 && !input && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wide">Quick searches</p>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map(a => (
              <button
                key={a.label}
                onClick={() => { setInput(a.query); inputRef.current?.focus(); }}
                className="px-2 py-1 text-[10px] rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 border-t border-panel-border bg-zinc-950/30">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={elicitation.active ? "Type your answer..." : "Search modules, ask questions, or describe what you need..."}
              className="w-full px-3 py-2 pr-10 text-xs rounded-md bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
              disabled={isLoading}
            />
            {elicitation.active ? (
              <Brain className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-violet-400" />
            ) : pendingBuildQuery ? (
              <Brain className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400" />
            ) : (
              <MessageCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600" />
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              "px-3 py-2 rounded-md flex items-center justify-center transition-all",
              input.trim() && !isLoading
                ? elicitation.active
                  ? "bg-violet-600 hover:bg-violet-500 text-white"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            )}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Message Bubble
// ============================================================================

function MsgBubble({ msg: m, onAddToCanvas, onView, onBuildCustom, onAddGenerated, onQuickReply }: {
  msg: Message;
  onAddToCanvas: (r: SearchResult) => void;
  onView: (r: SearchResult) => void;
  onBuildCustom: () => void;
  onAddGenerated: (m: LibraryModule) => void;
  onQuickReply: (v: string, l: string) => void;
}) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg px-3 py-2 bg-cyan-600/20 border border-cyan-500/30 text-cyan-100">
          <p className="text-xs leading-relaxed">{m.content}</p>
          <div className="text-[9px] mt-1.5 text-cyan-400/50 text-right">
            {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className={cn(
        "max-w-[95%] rounded-lg px-3 py-2",
        m.llmGenerated
          ? "bg-violet-900/20 border border-violet-500/20 text-zinc-300"
          : "bg-zinc-900/80 border border-zinc-800 text-zinc-300"
      )}>
        <div className="flex items-start gap-2">
          <div className={cn(
            "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5",
            m.llmGenerated ? "bg-violet-800/50" : "bg-zinc-800"
          )}>
            {m.isSearching ? (
              <Loader2 className="h-3 w-3 text-cyan-400 animate-spin" />
            ) : m.llmGenerated ? (
              <Brain className="h-3 w-3 text-violet-400" />
            ) : (
              <Sparkles className="h-3 w-3 text-cyan-400" />
            )}
          </div>
          <p className="text-xs leading-relaxed whitespace-pre-wrap flex-1">{m.content}</p>
        </div>

        {m.searchResults && m.searchResults.length > 0 && (
          <div className="mt-3 space-y-2 ml-7">
            {m.searchResults.map(r => (
              <ResultCard key={r.id} result={r} onAdd={() => onAddToCanvas(r)} onView={() => onView(r)} />
            ))}
            <button
              onClick={onBuildCustom}
              className="w-full mt-2 px-3 py-2 rounded-md border border-dashed border-zinc-700 hover:border-violet-500/40 bg-zinc-900/50 hover:bg-violet-500/5 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-zinc-500 group-hover:text-violet-400" />
                <span className="text-[11px] text-zinc-500 group-hover:text-violet-400">Build a custom module instead</span>
              </div>
            </button>
          </div>
        )}

        {m.generatedModule && (
          <div className="mt-3 ml-7">
            <ModuleCard module={m.generatedModule} onAdd={() => onAddGenerated(m.generatedModule!)} />
          </div>
        )}

        {m.quickReplies && m.quickReplies.length > 0 && (
          <div className="mt-3 ml-7 flex flex-wrap gap-1.5">
            {m.quickReplies.map(qr => (
              <button
                key={qr.value}
                onClick={() => onQuickReply(qr.value, qr.label)}
                className="px-2.5 py-1.5 text-[10px] rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-colors"
              >
                {qr.label}
              </button>
            ))}
          </div>
        )}

        <div className={cn("text-[9px] mt-2", m.llmGenerated ? "text-violet-400/40" : "text-zinc-600")}>
          {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Generated Module Card
// ============================================================================

function ModuleCard({ module, onAdd }: { module: LibraryModule; onAdd: () => void }) {
  const t = tacticCfg[module.tactic || 'control'] || tacticCfg['control'];
  const risk = module.riskLevel || 'medium';
  const params = module.parameters || [];
  return (
    <div className="rounded-lg border border-violet-500/30 bg-zinc-950/90 overflow-hidden shadow-lg shadow-violet-500/5">
      <div className="px-3 py-2.5 border-b border-violet-500/20 bg-violet-900/15">
        <div className="flex items-center gap-2">
          <span className="text-lg">{module.icon || '🤖'}</span>
          <div className="flex-1 min-w-0">
            <h4 className="text-[12px] font-semibold text-zinc-100 truncate">{module.name}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("text-[9px] font-medium", t.color)}>{t.label}</span>
              <span className="text-zinc-700">•</span>
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", riskColors[risk])}>
                {risk.toUpperCase()}
              </span>
              <span className="text-zinc-700">•</span>
              <span className="text-[9px] text-violet-400 font-medium">AI Built</span>
            </div>
          </div>
        </div>
      </div>
      {module.description && (
        <div className="px-3 py-2">
          <p className="text-[10px] text-zinc-400 line-clamp-2">{module.description}</p>
        </div>
      )}
      {params.length > 0 && (
        <div className="px-3 py-2 border-t border-zinc-800/50">
          <p className="text-[9px] text-zinc-500 mb-1.5 uppercase tracking-wide">Parameters</p>
          <div className="space-y-1">
            {params.slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 text-[10px]">
                <span className="text-zinc-500 font-mono">{p.id}</span>
                {p.required && <span className="text-red-400 text-[8px]">REQ</span>}
                <span className="text-zinc-600 ml-auto">{p.type}</span>
              </div>
            ))}
            {params.length > 5 && <p className="text-[9px] text-zinc-600">+{params.length - 5} more</p>}
          </div>
        </div>
      )}
      {(module.shellCommand || module.cobaltStrikeCommand) && (
        <div className="px-3 py-2 border-t border-zinc-800/50">
          <p className="text-[9px] text-zinc-500 mb-1 uppercase tracking-wide">Command</p>
          <div className="bg-zinc-900 rounded px-2 py-1.5 font-mono text-[9px] text-cyan-300/80 overflow-x-auto">
            <p className="whitespace-nowrap">{module.shellCommand || module.cobaltStrikeCommand}</p>
          </div>
        </div>
      )}
      <div className="px-2.5 py-2 border-t border-violet-500/20 bg-violet-900/10">
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-violet-600/25 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 hover:text-violet-200 transition-all font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[11px]">Add to Canvas</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Search Result Card
// ============================================================================

function ResultCard({ result, onAdd, onView }: { result: SearchResult; onAdd: () => void; onView: () => void }) {
  const t = tacticCfg[result.cluster] || tacticCfg['control'];
  const risk = result.riskLevel || 'medium';
  const score = Math.min(Math.round((result.relevance_score / 12) * 100), 100);
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/80 overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base flex-shrink-0">{t.icon}</span>
            <div className="min-w-0">
              <h4 className="text-[11px] font-medium text-zinc-200 truncate">{result.label}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn("text-[9px]", t.color)}>{t.label}</span>
                {result.riskLevel && (
                  <>
                    <span className="text-zinc-700">•</span>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", riskColors[risk])}>
                      {risk.toUpperCase()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          {score > 0 && (
            <div className="flex-shrink-0 text-right">
              <div className="text-[10px] text-cyan-400 font-mono">{score}%</div>
              <div className="text-[8px] text-zinc-600">match</div>
            </div>
          )}
        </div>
      </div>
      {result.description && (
        <div className="px-3 py-2">
          <p className="text-[10px] text-zinc-500 line-clamp-2">{result.description}</p>
        </div>
      )}
      <div className="px-2 py-1.5 border-t border-zinc-800/50 flex gap-1.5">
        <button
          onClick={onAdd}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-400 transition-colors"
        >
          <Plus className="h-3 w-3" />
          <span className="text-[10px] font-medium">Add to Canvas</span>
        </button>
        <button
          onClick={onView}
          className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 transition-colors"
          title="View details"
        >
          <Eye className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export default AIAssistantPanel;