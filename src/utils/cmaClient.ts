// Limited-permission API token from https://vrai.admin.datocms.com/environments/datocms-support-plugin-testing/project_settings/access_tokens/321640/edit
// You could also use ctx.currentUserAccessToken instead, but that has all the permissions of the current editor. This way is safer.
import { buildClient } from "@datocms/cma-client-browser";

const accessToken = import.meta.env.VITE_DATOCMS_LIMITED_ACCESS_TOKEN;
const env = import.meta.env.VITE_DATOCMS_ENVIRONMENT ?? "main";

// Initialize Dato CMA client
export const cmaClient = buildClient({
  apiToken: accessToken,
  environment: env,
});
