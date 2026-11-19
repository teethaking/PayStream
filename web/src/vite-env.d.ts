/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_VAULT_ADDRESS?: string;
  readonly VITE_VAULT_DEPLOY_BLOCK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_ASSISTANT_LLM?: string;
  readonly VITE_BASE?: string;
}
