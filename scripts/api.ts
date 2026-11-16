interface RequestOptions {
  method?: string;
  body?: Record<string, string>;
  query?: Record<string, string>;
}

interface WikiApiResponse {
  query?: {
    tokens?: {
      csrftoken?: string;
      logintoken?: string;
    };
    pages?: {
      missing?: boolean;
      revisions?: { slots: { main: { content: string } } }[];
    }[];
  };
  login?: {
    result?: string;
  };
  edit?: {
    result?: string;
    nochange?: string;
    newrevid?: number;
  };
  error?: {
    code: string;
    info: string;
  };
}

export interface EditResult {
  nochange: boolean;
  newrevid?: number;
}

const entry = "https://prts.wiki/api.php";
const REQUEST_TIMEOUT_MS = 60_000;

let csrfToken: string | undefined;

const cookies = new Map<string, string>();

function setCookieFromResponse(response: Response): void {
  const setCookieHeader = response.headers.get("set-cookie");
  if (setCookieHeader) {
    const cookieStrings = setCookieHeader.split(",");
    for (const cookieString of cookieStrings) {
      const [nameValue] = cookieString.trim().split(";");
      const [name, value] = nameValue.split("=");
      if (name && value) {
        cookies.set(name.trim(), value.trim());
      }
    }
  }
}

function getCookieHeader(): string {
  const cookieArray: string[] = [];
  for (const [name, value] of cookies) {
    cookieArray.push(`${name}=${value}`);
  }
  return cookieArray.join("; ");
}

async function request({
  method = "GET",
  body,
  query,
}: RequestOptions): Promise<WikiApiResponse> {
  const url = new URL(entry);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, value);
    }
  }

  const headers: HeadersInit = {};

  // Add cookies if we have any
  const cookieHeader = getCookieHeader();
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  let requestBody: BodyInit | undefined;

  if (body && method === "POST") {
    const formData = new URLSearchParams(body);
    requestBody = formData;
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const response = await fetch(url.href, {
    method,
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();
  const snippet = () => text.slice(0, 200).replaceAll(/\s+/g, " ");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${snippet()}`);
  }

  setCookieFromResponse(response);

  try {
    return JSON.parse(text) as WikiApiResponse;
  } catch {
    throw new Error(`响应不是 JSON（HTTP ${response.status}）: ${snippet()}`);
  }
}

export async function getCsrfToken(): Promise<string> {
  const resp = await request({
    method: "GET",
    query: {
      action: "query",
      meta: "tokens",
      type: "csrf",
      format: "json",
    },
  });

  const token = resp.query?.tokens?.csrftoken;
  if (!token) {
    throw new Error("Failed to get CSRF token");
  }
  return token;
}

async function getLoginToken(): Promise<string> {
  const resp = await request({
    query: {
      action: "query",
      meta: "tokens",
      format: "json",
      type: "login",
    },
  });

  const token = resp.query?.tokens?.logintoken;
  if (!token) {
    throw new Error("Failed to get login token");
  }
  return token;
}

export async function login(name: string, password: string): Promise<void> {
  const token = await getLoginToken();

  const resp = await request({
    method: "POST",
    body: {
      action: "login",
      lgname: name,
      lgpassword: password,
      lgtoken: token,
      format: "json",
    },
  });

  if (resp.login?.result?.toLowerCase() !== "success") {
    throw new Error(`Login failed: ${resp}`);
  }
}

export async function create(
  pagename: string,
  content: string,
  summary: string = "by prts-widgets script",
): Promise<void> {
  const token = await getCsrfToken();
  const resp = await request({
    method: "POST",
    body: {
      action: "edit",
      title: pagename,
      text: content,
      bot: "1",
      summary,
      token,
      format: "json",
      createonly: "1",
    },
  });
  console.log(resp);
}

/** 编辑失败（HTTP 错误、API 返回 error、result 不是 Success）时抛错。 */
export async function edit(
  pagename: string,
  content: string,
  summary: string = "by prts-widgets script",
): Promise<EditResult> {
  csrfToken ??= await getCsrfToken();
  const resp = await request({
    method: "POST",
    body: {
      action: "edit",
      title: pagename,
      text: content,
      bot: "1",
      summary,
      token: csrfToken,
      format: "json",
    },
  });

  if (resp.error) {
    // 会话被重置后旧 token 会失效，下次调用重新取
    if (resp.error.code === "badtoken") csrfToken = undefined;
    throw new Error(
      `编辑 ${pagename} 失败：${resp.error.code}: ${resp.error.info}`,
    );
  }
  if (resp.edit?.result !== "Success") {
    throw new Error(
      `编辑 ${pagename} 失败：${JSON.stringify(resp.edit ?? resp)}`,
    );
  }

  return {
    nochange: resp.edit.nochange !== undefined,
    newrevid: resp.edit.newrevid,
  };
}

/** 页面不存在时返回 undefined。 */
export async function getContent(
  pagename: string,
): Promise<string | undefined> {
  const resp = await request({
    query: {
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      titles: pagename,
      format: "json",
      formatversion: "2",
    },
  });
  return resp.query?.pages?.[0]?.revisions?.[0]?.slots.main.content;
}

async function view(pagename: string): Promise<Response> {
  return await fetch(`https://prts.wiki/w/${pagename}`);
}

export async function checkPageExist(pagename: string): Promise<boolean> {
  try {
    const response = await view(pagename);
    return response.ok;
  } catch (error) {
    console.log(error);
    return false;
  }
}
