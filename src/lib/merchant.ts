import { getPlatformSettings, updatePlatformSettings } from "./db";
import { lytClient } from "./lytpay";

const globalForMerchant = globalThis as unknown as {
  __merchantSessId?: string | null;
  __merchantSessEmail?: string | null;
  __merchantLoginPromise?: Promise<string> | null;
};

/**
 * Ensures a valid PHPSESSID for the configured merchant/escrow Lyt IT Pay account.
 * Reuses cached session (both in-memory and persisted in settings) to avoid rate limits.
 */
export async function getMerchantSession(): Promise<{
  sessId: string;
  email: string;
  password: string;
}> {
  const settings = await getPlatformSettings();
  const email = settings.merchant_email.trim();
  const password = settings.merchant_password;

  if (!email || !password) {
    throw new Error(
      "尚未配置 Lyt IT Pay 托管收款账号（请在环境变量或后台设置 LYT_MERCHANT_EMAIL 与 LYT_MERCHANT_PASSWORD）"
    );
  }

  const candidateSessId =
    (globalForMerchant.__merchantSessEmail === email ? globalForMerchant.__merchantSessId : null) ||
    settings.merchant_sess_id;

  if (candidateSessId) {
    try {
      const check = await lytClient.checkSession(candidateSessId);
      if (check.is_logged_in) {
        globalForMerchant.__merchantSessId = candidateSessId;
        globalForMerchant.__merchantSessEmail = email;
        return { sessId: candidateSessId, email, password };
      }
    } catch {
      // Session invalid or expired; re-login below
    }
  }

  if (!globalForMerchant.__merchantLoginPromise) {
    globalForMerchant.__merchantLoginPromise = (async () => {
      const { sessId } = await lytClient.login(email, password);
      globalForMerchant.__merchantSessId = sessId;
      globalForMerchant.__merchantSessEmail = email;
      await updatePlatformSettings({
        merchant_sess_id: sessId,
        merchant_sess_updated_at: new Date().toISOString(),
      });
      return sessId;
    })().finally(() => {
      globalForMerchant.__merchantLoginPromise = null;
    });
  }

  const sessId = await globalForMerchant.__merchantLoginPromise;
  return { sessId, email, password };
}

/**
 * Executes a merchant operation; if session expired mid-flight, clears cache and retries once.
 */
export async function withMerchantSession<T>(
  fn: (ctx: { sessId: string; email: string; password: string }) => Promise<T>
): Promise<T> {
  const ctx = await getMerchantSession();
  try {
    return await fn(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("登入") || msg.includes("登录") || msg.includes("Session") || msg.includes("403")) {
      globalForMerchant.__merchantSessId = null;
      await updatePlatformSettings({ merchant_sess_id: "" });
      const freshCtx = await getMerchantSession();
      return await fn(freshCtx);
    }
    throw err;
  }
}
