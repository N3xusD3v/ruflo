// Per-request tool selection (RAG-MCP style).
//
// Sending every MCP tool on every call costs ~46k tokens for 239 tools and
// makes tool choice worse. This picks the TOOL_SELECT_MAX tools most related
// to the latest user messages, using a small multilingual embedding model run
// locally (queries are Portuguese, tool descriptions English), and falls back
// to keyword overlap if the model cannot load. Tools named in the request or
// already called in the conversation are always kept.

const MAX = Number(process.env.TOOL_SELECT_MAX ?? 24); // 0 disables selection
const MODEL = process.env.TOOL_EMBED_MODEL || "Xenova/multilingual-e5-base";
const MODELS_DIR = process.env.TOOL_EMBED_MODELS_DIR || "/app/models";

let extractorPromise;
const toolVectors = new Map(); // "name\ndescription" -> Float32Array

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = MODELS_DIR;
      env.localModelPath = MODELS_DIR;
      env.allowRemoteModels = false; // baked into the image at build time
      return pipeline("feature-extraction", MODEL, { dtype: "q8" });
    })().catch(err => {
      console.warn(`[tools] embedding model unavailable (${err.message}); using keyword fallback`);
      return null;
    });
  }
  return extractorPromise;
}

async function embed(extractor, texts) {
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  const dim = out.dims[out.dims.length - 1];
  return texts.map((_, i) => out.data.slice(i * dim, (i + 1) * dim));
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(p => (typeof p === "string" ? p : p?.text || "")).join(" ");
  return "";
}

// Last two user turns: enough context for follow-ups like "e a memória?".
function queryText(messages) {
  const users = (messages || []).filter(m => m?.role === "user").slice(-2);
  return users.map(m => textOf(m.content)).join("\n").slice(0, 2000);
}

const toolName = t => t?.function?.name || t?.name || "";
const toolDesc = t => t?.function?.description ?? t?.description ?? "";
// Short name + first sentence: the namespace ("ruflo__", "ruvector__hooks_")
// and the boilerplate shared by ruflo descriptions ("Use when native Bash is
// wrong...") make every tool look alike to a small embedding model.
const toolDoc = t => {
  const short = toolName(t).split("__").pop().replace(/^hooks_/, "").replace(/[_-]/g, " ");
  const desc = toolDesc(t).split(/\s+Use when\b|\n/)[0].split(/(?<=[.!?])\s/)[0];
  return `${short}: ${desc}`.slice(0, 300);
};

function keywordScores(tools, query) {
  const words = new Set(query.toLowerCase().match(/[a-zà-ú0-9]{3,}/g) || []);
  return tools.map(t => {
    const doc = toolDoc(t).toLowerCase();
    let s = 0;
    for (const w of words) if (doc.includes(w)) s++;
    return s;
  });
}

/**
 * @param {Array} tools  OpenAI-format tool definitions
 * @param {Array} messages  chat history
 * @param {{ alwaysNames?: string[], max?: number }} [opts]
 */
export async function selectTools(tools, messages, opts = {}) {
  const max = opts.max ?? MAX;
  if (!Array.isArray(tools) || !max || tools.length <= max) return tools;
  const t0 = Date.now();
  const query = queryText(messages);

  const keep = new Set(opts.alwaysNames || []);
  for (const t of tools) if (query.includes(toolName(t))) keep.add(toolName(t));
  for (const m of messages || []) for (const tc of m?.tool_calls || []) if (tc?.function?.name) keep.add(tc.function.name);

  let scores;
  let mode = "keyword";
  const extractor = query ? await getExtractor() : null;
  if (extractor) {
    try {
      const missing = tools.filter(t => !toolVectors.has(toolDoc(t)));
      for (let i = 0; i < missing.length; i += 64) {
        const batch = missing.slice(i, i + 64);
        const vecs = await embed(extractor, batch.map(t => `passage: ${toolDoc(t)}`));
        batch.forEach((t, j) => toolVectors.set(toolDoc(t), vecs[j]));
      }
      const [q] = await embed(extractor, [`query: ${query}`]);
      scores = tools.map(t => dot(q, toolVectors.get(toolDoc(t))));
      mode = "embedding";
    } catch (err) {
      console.warn(`[tools] embedding failed (${err.message}); using keyword fallback`);
    }
  }
  if (!scores) scores = keywordScores(tools, query);

  const kept = tools.filter(t => keep.has(toolName(t)));
  const ranked = tools
    .map((t, i) => ({ t, s: scores[i] }))
    .filter(({ t }) => !keep.has(toolName(t)))
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.max(0, max - kept.length))
    .map(({ t }) => t);
  const selected = [...kept, ...ranked];
  console.log(
    `[tools] ${selected.length}/${tools.length} (${mode}, ${Date.now() - t0}ms): ` +
      ranked.slice(0, 6).map(toolName).join(", ")
  );
  return selected;
}

// Warm the model at startup so the first chat does not pay the load time.
export function warmToolSelector() {
  if (MAX) getExtractor();
}
