/**
 * The canonical provider catalog — the SINGLE source of truth.
 *
 * It used to be three copies: this list (TUI), PROVIDER_DEFAULT_MODELS
 * (router) and the providers map in defaultConfig() (config). They drifted
 * (togetherai had two different default models, siliconflow two base URLs,
 * anthropic models on three different releases) and nothing could catch it.
 * Everything below is generated once from those three, with precedence:
 * curated DEFAULT_MODELS membership → provider-defaults (router's pick) → tui.
 * defaultConfig(), the TUI and the router all read this file now.
 */
export interface ProviderCatalogEntry {
  readonly key: string;
  readonly label: string;
  readonly kind: "free" | "byok" | "local";
  readonly type: "openai" | "anthropic" | "gemini";
  readonly baseUrl: string;
  readonly env?: string;
  readonly apiKey?: string;
  readonly defaultModel: string;
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  { key: "302ai", label: "302.AI", kind: "byok", type: "openai", baseUrl: "https://api.302.ai/v1", env: "AI_302AI_API_KEY", defaultModel: "kimi-k3.1-pro" },
  { key: "alibaba", label: "Alibaba DashScope (Qwen)", kind: "byok", type: "openai", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", env: "DASHSCOPE_API_KEY", defaultModel: "qwen3.8-omni-flash" },
  { key: "anthropic", label: "Anthropic (Claude)", kind: "byok", type: "anthropic", baseUrl: "https://api.anthropic.com", env: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4-5" },
  { key: "cerebras", label: "Cerebras", kind: "byok", type: "openai", baseUrl: "https://api.cerebras.ai/v1", env: "CEREBRAS_API_KEY", defaultModel: "qwen-3.8-27b" },
  { key: "cohere", label: "Cohere", kind: "byok", type: "openai", baseUrl: "https://api.cohere.com/compatibility/v1", env: "COHERE_API_KEY", defaultModel: "north-mini-code-1-0" },
  { key: "deepinfra", label: "DeepInfra", kind: "byok", type: "openai", baseUrl: "https://api.deepinfra.com/v1/openai", env: "DEEPINFRA_API_KEY", defaultModel: "deepseek-ai/DeepSeek-V4.1-Flash-1017" },
  { key: "deepseek", label: "DeepSeek", kind: "byok", type: "openai", baseUrl: "https://api.deepseek.com/v1", env: "DEEPSEEK_API_KEY", defaultModel: "deepseek-flash" },
  { key: "fireworks", label: "Fireworks AI", kind: "byok", type: "openai", baseUrl: "https://api.fireworks.ai/inference/v1", env: "FIREWORKS_API_KEY", defaultModel: "accounts/fireworks/models/kimi-k3p1-pro" },
  { key: "friendli", label: "Friendli", kind: "byok", type: "openai", baseUrl: "https://api.friendli.ai/serverless/v1", env: "FRIENDLI_API_KEY", defaultModel: "zai-org/GLM-5.3-Flash" },
  { key: "gemini", label: "Google Gemini", kind: "byok", type: "gemini", baseUrl: "https://generativelanguage.googleapis.com", env: "GEMINI_API_KEY", defaultModel: "gemini-3.8-flash" },
  { key: "github", label: "GitHub Models", kind: "byok", type: "openai", baseUrl: "https://models.github.ai/inference", env: "GITHUB_TOKEN", defaultModel: "openai/gpt-4o-mini" },
  { key: "gpt4all", label: "GPT4All (local)", kind: "local", type: "openai", baseUrl: "http://localhost:4891/v1", apiKey: "gpt4all", defaultModel: "llama3.2" },
  { key: "groq", label: "Groq", kind: "byok", type: "openai", baseUrl: "https://api.groq.com/openai/v1", env: "GROQ_API_KEY", defaultModel: "openai/gpt-oss-120b" },
  { key: "huggingface", label: "Hugging Face", kind: "byok", type: "openai", baseUrl: "https://router.huggingface.co/v1", env: "HF_TOKEN", defaultModel: "zai-org/GLM-4.7-Flash" },
  { key: "koboldcpp", label: "KoboldCpp (local)", kind: "local", type: "openai", baseUrl: "http://localhost:5001/v1", apiKey: "koboldcpp", defaultModel: "llama3.2" },
  { key: "llama_cpp", label: "llama.cpp (local)", kind: "local", type: "openai", baseUrl: "http://localhost:8080/v1", apiKey: "llama.cpp", defaultModel: "llama3.2" },
  { key: "lmstudio", label: "LM Studio (local)", kind: "local", type: "openai", baseUrl: "http://localhost:1234/v1", apiKey: "lmstudio", defaultModel: "qwen/qwen3-coder-30b" },
  { key: "minimax", label: "MiniMax", kind: "byok", type: "anthropic", baseUrl: "https://api.minimax.io/anthropic", env: "MINIMAX_API_KEY", defaultModel: "MiniMax-M3.1-Flash" },
  { key: "mistral", label: "Mistral", kind: "byok", type: "openai", baseUrl: "https://api.mistral.ai/v1", env: "MISTRAL_API_KEY", defaultModel: "labs-leanstral-1-5-1" },
  { key: "moonshotai", label: "Moonshot AI (Kimi)", kind: "byok", type: "openai", baseUrl: "https://api.moonshot.ai/v1", env: "MOONSHOT_API_KEY", defaultModel: "kimi-k3.1-pro" },
  { key: "moonshotai_cn", label: "Moonshot AI CN", kind: "byok", type: "openai", baseUrl: "https://api.moonshot.cn/v1", env: "MOONSHOT_API_KEY", defaultModel: "moonshot-v1-auto" },
  { key: "nebius", label: "Nebius", kind: "byok", type: "openai", baseUrl: "https://api.tokenfactory.nebius.com/v1", env: "NEBIUS_API_KEY", defaultModel: "MiniMaxAI/MiniMax-M3.1-Flash" },
  { key: "novita", label: "Novita AI", kind: "byok", type: "openai", baseUrl: "https://api.novita.ai/openai", env: "NOVITA_API_KEY", defaultModel: "tencent/hy4" },
  { key: "nvidia", label: "NVIDIA NIM", kind: "byok", type: "openai", baseUrl: "https://integrate.api.nvidia.com/v1", env: "NVIDIA_API_KEY", defaultModel: "nvidia/nemotron-3.5-super-vl-120b-a12b" },
  { key: "ollama", label: "Ollama (local)", kind: "local", type: "openai", baseUrl: "http://localhost:11434/v1", apiKey: "ollama", defaultModel: "llama3.2" },
  { key: "ollama_cloud", label: "Ollama Cloud", kind: "byok", type: "openai", baseUrl: "https://ollama.com/v1", env: "OLLAMA_API_KEY", defaultModel: "kimi-k3.1-pro" },
  { key: "ollama_cn", label: "Ollama CN", kind: "byok", type: "openai", baseUrl: "http://localhost:11435/v1", apiKey: "ollama", defaultModel: "llama3.2" },
  { key: "openai", label: "OpenAI", kind: "byok", type: "openai", baseUrl: "https://api.openai.com/v1", env: "OPENAI_API_KEY", defaultModel: "gpt-6.1-terra" },
  { key: "opencode", label: "OpenCode (free)", kind: "free", type: "openai", baseUrl: "https://opencode.ai/inference/openai/v1", defaultModel: "inkling-2-small-free" },
  { key: "openrouter", label: "OpenRouter (free tier)", kind: "byok", type: "openai", baseUrl: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY", defaultModel: "nvidia/nemotron-3.5-super-vl:free" },
  { key: "openwebui", label: "Open WebUI (local)", kind: "local", type: "openai", baseUrl: "http://localhost:3000/v1", apiKey: "openwebui", defaultModel: "local-model" },
  { key: "perplexity", label: "Perplexity", kind: "byok", type: "openai", baseUrl: "https://api.perplexity.ai", env: "PERPLEXITY_API_KEY", defaultModel: "sonar-pro" },
  { key: "poe", label: "Poe", kind: "byok", type: "openai", baseUrl: "https://api.poe.com/v1", env: "POE_API_KEY", defaultModel: "google/gemini-3.8-flash" },
  { key: "sambanova", label: "SambaNova", kind: "byok", type: "openai", baseUrl: "https://api.sambanova.ai/v1", env: "SAMBANOVA_API_KEY", defaultModel: "MiniMax-M3" },
  { key: "siliconflow", label: "SiliconFlow", kind: "byok", type: "openai", baseUrl: "https://api.siliconflow.com/v1", env: "SILICONFLOW_API_KEY", defaultModel: "deepseek-ai/DeepSeek-V4-Flash-0731" },
  { key: "stepfun", label: "StepFun", kind: "byok", type: "openai", baseUrl: "https://api.stepfun.ai/v1", env: "STEPFUN_API_KEY", defaultModel: "step-5-preview" },
  { key: "stepfun_cn", label: "StepFun CN", kind: "byok", type: "openai", baseUrl: "https://api.stepfun.com/v1", env: "STEPFUN_API_KEY", defaultModel: "step-5-preview" },
  { key: "textgen", label: "text-generation-webui", kind: "local", type: "openai", baseUrl: "http://localhost:5000/v1", apiKey: "textgen", defaultModel: "llama3.2" },
  { key: "togetherai", label: "Together AI", kind: "byok", type: "openai", baseUrl: "https://api.together.xyz/v1", env: "TOGETHER_API_KEY", defaultModel: "moonshotai/Kimi-K3.1-Pro" },
  { key: "venice", label: "Venice AI", kind: "byok", type: "openai", baseUrl: "https://api.venice.ai/api/v1", env: "VENICE_API_KEY", defaultModel: "deepseek-v4-1-flash-1017" },
  { key: "vercel", label: "Vercel AI Gateway", kind: "byok", type: "openai", baseUrl: "https://ai-gateway.vercel.sh/v1", env: "VERCEL_AI_GATEWAY_API_KEY", defaultModel: "reflection/beam-free" },
  { key: "vllm", label: "vLLM (local)", kind: "local", type: "openai", baseUrl: "http://localhost:8000/v1", apiKey: "vllm", defaultModel: "llama3.2" },
  { key: "volcengine", label: "Volcengine (Doubao)", kind: "byok", type: "openai", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", env: "VOLCENGINE_API_KEY", defaultModel: "deepseek-v4-flash-ga-260731" },
  { key: "xai", label: "xAI (Grok)", kind: "byok", type: "openai", baseUrl: "https://api.x.ai/v1", env: "XAI_API_KEY", defaultModel: "grok-4.7" },
  { key: "zai", label: "Z.AI (GLM)", kind: "byok", type: "openai", baseUrl: "https://api.z.ai/api/paas/v4", env: "ZAI_API_KEY", defaultModel: "glm-4.7-flash" },
  { key: "zhipuai", label: "Zhipu AI (GLM)", kind: "byok", type: "openai", baseUrl: "https://open.bigmodel.cn/api/paas/v4", env: "ZHIPU_API_KEY", defaultModel: "glm-4.7-flash" },
];

/** provider → default model (used by the router to pick one model per provider) */
export const PROVIDER_DEFAULT_MODELS: Record<string, string> = Object.fromEntries(
  PROVIDER_CATALOG.map((entry) => [entry.key, entry.defaultModel]),
);

