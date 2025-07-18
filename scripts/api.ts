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
  };
  login?: {
    result?: string;
  };
  edit?: {
    result?: string;
  };
}

const entry = "https://prts.wiki/api.php";

// Simple cookie storage for maintaining session
const cookies = new Map<string, string>();

function setCookieFromResponse(response: Response): void {
  const setCookieHeader = response.headers.get("set-cookie");
  if (setCookieHeader) {
    // Parse set-cookie header and store cookies
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

  // Add query parameters
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, value);
    }
  }

  const headers: HeadersInit = {
    "User-Agent": "prts-widgets-script",
  };

  // Add cookies if we have any
  const cookieHeader = getCookieHeader();
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  let requestBody: BodyInit | undefined;

  // Handle form data
  if (body && method === "POST") {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      formData.append(key, value);
    }
    requestBody = formData;
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  // Store cookies from response
  setCookieFromResponse(response);

  return (await response.json()) as WikiApiResponse;
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
    console.error(JSON.stringify(resp));
    throw new Error(`Login failed: ${JSON.stringify(resp)}`);
  }
}

export async function create(
  pagename: string,
  content: string,
  summary: string = "by prts-micro-frontends script",
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

export async function edit(
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
    },
  });
  console.log(resp);
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
