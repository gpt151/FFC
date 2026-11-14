const DEFAULT_BASE_URL = "https://pay.teft.us";

export function getLytBaseUrl(): string {
  return (process.env.LYT_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export interface LytApiResponse<T = Record<string, unknown>> {
  status: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

export interface LytPaymentLinkStatusData {
  id: number;
  link_code: string;
  amount: string;
  note: string | null;
  status: "pending" | "completed" | "canceled";
  creator_id: number;
  creator_email: string;
  payer_id: number | null;
  payer_email: string | null;
  created_at: string;
  paid_at: string | null;
  transaction_id: number | null;
}

export interface LytAuthLinkResponse {
  status: string;
  auth_code?: string;
  auth_url?: string;
  secret_key?: string;
  expires_in_seconds?: number;
  message?: string;
  data?: {
    auth_code: string;
    auth_url: string;
    secret_key: string;
    expires_in_seconds: number;
  };
}

export interface LytAuthInfoResponse {
  status: "success" | "pending" | "expired" | "error";
  auth_status?: "authorized" | "pending" | "expired" | "canceled";
  message?: string;
  data?: {
    user_id: number;
    email: string;
    authorized_at: string;
    app_name?: string;
  };
}

function extractPhpSessId(headers: Headers): string | null {
  const setCookies =
    typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [headers.get("set-cookie") || ""];

  for (const cookieStr of setCookies) {
    const match = cookieStr.match(/PHPSESSID=([^;\s]+)/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export class LytPayClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || getLytBaseUrl()).replace(/\/+$/, "");
  }

  private async request<T = LytApiResponse>(
    endpoint: "api.php" | "auth.php",
    action: string,
    options: {
      method?: "GET" | "POST";
      params?: Record<string, string | number | undefined>;
      sessId?: string | null;
    } = {}
  ): Promise<{ data: T; sessId: string | null; httpStatus: number }> {
    const method = options.method || "GET";
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set("action", action);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (options.sessId) {
      headers["Cookie"] = `PHPSESSID=${options.sessId}; lang=zh`;
    } else {
      headers["Cookie"] = "lang=zh";
    }

    let body: string | undefined;
    if (method === "GET" && options.params) {
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    } else if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const form = new URLSearchParams();
      form.set("action", action);
      if (options.params) {
        for (const [k, v] of Object.entries(options.params)) {
          if (v !== undefined && v !== null) {
            form.set(k, String(v));
          }
        }
      }
      body = form.toString();
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      body,
      cache: "no-store",
    });

    const newSessId = extractPhpSessId(res.headers) || options.sessId || null;
    const rawText = await res.text();
    let parsed: T;
    try {
      parsed = JSON.parse(rawText) as T;
    } catch {
      throw new Error(`Lyt IT Pay 返回非 JSON 响应 (HTTP ${res.status}): ${rawText.slice(0, 200)}`);
    }

    return { data: parsed, sessId: newSessId, httpStatus: res.status };
  }

  async checkSession(sessId: string): Promise<{ is_logged_in: boolean; email?: string }> {
    const { data } = await this.request<{ is_logged_in: boolean; email?: string }>(
      "api.php",
      "check_session",
      { method: "GET", sessId }
    );
    return data;
  }

  async login(email: string, password: string): Promise<{ sessId: string; message?: string }> {
    const { data, sessId } = await this.request<LytApiResponse>("api.php", "login", {
      method: "POST",
      params: { email, password },
    });

    if (data.status !== "success" || !sessId) {
      throw new Error(data.message || "Lyt IT Pay 托管账户登录失败");
    }
    return { sessId, message: data.message };
  }

  async getBalance(sessId: string): Promise<{ balance: string; email: string }> {
    const { data } = await this.request<{
      status: string;
      balance?: string;
      email?: string;
      message?: string;
    }>("api.php", "get_balance", { method: "GET", sessId });

    if (data.status !== "success") {
      throw new Error(data.message || "获取余额失败");
    }
    return { balance: data.balance || "0.00", email: data.email || "" };
  }

  async createPaymentLink(
    sessId: string,
    amount: string,
    note: string
  ): Promise<{ linkCode: string; payUrl: string }> {
    const { data } = await this.request<
      LytApiResponse<{ code?: string; link_code?: string }> & {
        code?: string;
        link_code?: string;
      }
    >("api.php", "create_payment_link", {
      method: "POST",
      sessId,
      params: { amount, note },
    });

    if (data.status !== "success") {
      throw new Error(data.message || "创建 Lyt IT Pay 收款链接失败");
    }

    const linkCode =
      (data.code as string | undefined) ||
      (data.link_code as string | undefined) ||
      data.data?.code ||
      data.data?.link_code;

    if (!linkCode) {
      throw new Error(`收款链接返回缺少 code: ${JSON.stringify(data)}`);
    }

    return {
      linkCode,
      payUrl: `${this.baseUrl}/pay?id=${encodeURIComponent(linkCode)}`,
    };
  }

  async getPaymentLinkStatus(
    sessId: string,
    code: string
  ): Promise<LytPaymentLinkStatusData> {
    const { data, httpStatus } = await this.request<LytApiResponse<LytPaymentLinkStatusData>>(
      "api.php",
      "get_payment_link_status",
      {
        method: "GET",
        sessId,
        params: { code },
      }
    );

    if (httpStatus === 403) {
      throw new Error("当前托管账户无权查询该收款链接状态 (HTTP 403)");
    }
    if (data.status !== "success" || !data.data) {
      throw new Error(data.message || "查询收款链接状态失败");
    }
    return data.data;
  }

  async cancelPaymentLink(sessId: string, paymentLinkId: number): Promise<void> {
    const { data } = await this.request<LytApiResponse>("api.php", "cancel_payment_link", {
      method: "POST",
      sessId,
      params: { id: paymentLinkId },
    });
    if (data.status !== "success") {
      throw new Error(data.message || "撤销收款链接失败");
    }
  }

  async transfer(
    sessId: string,
    params: {
      receiverEmail: string;
      amount: string;
      note: string;
      password: string;
    }
  ): Promise<LytApiResponse> {
    const { data } = await this.request<LytApiResponse>("api.php", "transfer", {
      method: "POST",
      sessId,
      params: {
        receiver_email: params.receiverEmail,
        amount: params.amount,
        note: params.note,
        password: params.password,
      },
    });

    if (data.status !== "success") {
      throw new Error(data.message || "Lyt IT Pay 转账失败");
    }
    return data;
  }

  async getTransactions(sessId: string, page = 1): Promise<Record<string, unknown>> {
    const { data } = await this.request<Record<string, unknown>>("api.php", "get_transactions", {
      method: "GET",
      sessId,
      params: { page },
    });
    return data;
  }

  async createAuthLink(appName: string, redirectUri: string): Promise<{
    authCode: string;
    authUrl: string;
    secretKey: string;
    expiresInSeconds: number;
  }> {
    const { data } = await this.request<LytAuthLinkResponse>("auth.php", "create_auth_link", {
      method: "POST",
      params: {
        app_name: appName,
        redirect_uri: redirectUri,
      },
    });

    const authCode = data.auth_code || data.data?.auth_code;
    const authUrl = data.auth_url || data.data?.auth_url;
    const secretKey = data.secret_key || data.data?.secret_key;
    const expiresInSeconds = data.expires_in_seconds || data.data?.expires_in_seconds || 600;

    if (data.status !== "success" || !authCode || !authUrl || !secretKey) {
      throw new Error(data.message || "创建 Lyt IT Pay 授权链接失败");
    }

    return { authCode, authUrl, secretKey, expiresInSeconds };
  }

  async getAuthInfo(code: string, secretKey: string): Promise<LytAuthInfoResponse> {
    const { data } = await this.request<LytAuthInfoResponse>("auth.php", "get_auth_info", {
      method: "GET",
      params: {
        code,
        secret: secretKey,
      },
    });
    return data;
  }
}

export const lytClient = new LytPayClient();
