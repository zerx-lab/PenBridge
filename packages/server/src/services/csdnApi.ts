/**
 * CSDN API 服务
 * 基于 HTTP API 直接调用
 * 
 * 主要功能：
 * 1. 保存/发布文章
 * 2. 上传图片
 * 3. 获取分类和标签
 * 4. 检查登录状态
 * 
 * API 基础信息：
 * - 基础域名: https://bizapi.csdn.net
 * - 需要签名头: x-ca-key, x-ca-nonce, x-ca-signature
 * - x-ca-key 固定值: 203803574
 */

import * as crypto from "crypto";

// 调试日志开关
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log("[CsdnAPI]", ...args);
  }
}

// Cookie 信息接口
export interface CsdnCookies {
  UserToken: string;
  UserName: string;
  UserInfo?: string;
  SESSION?: string;
  AU?: string;
  UN?: string;
  [key: string]: string | undefined;
}

// 标签信息
export interface CsdnTagInfo {
  name: string;
}

// 保存文章参数
export interface SaveArticleParams {
  articleId?: string; // 文章ID，更新时需要
  title: string;
  markdownContent: string;
  htmlContent: string;
  tags?: string[];
  description?: string;
  coverImages?: string[];
  type?: "original" | "repost" | "translated"; // 原创/转载/翻译
  readType?: "public" | "private" | "fans" | "vip"; // 可见范围
  pubStatus?: "draft" | "publish"; // 发布状态
}

// 保存文章响应
export interface SaveArticleResponse {
  id: number;
  url: string;
  title: string;
  qrcode: string;
}

// 用户信息
export interface CsdnUserInfo {
  userName: string;
  nickName?: string;
  avatarUrl?: string;
}

/**
 * CSDN API 客户端
 */
export class CsdnApiClient {
  private baseUrl = "https://bizapi.csdn.net";
  // 旧版 API 基础 URL（不需要签名）
  private legacyBaseUrl = "https://blog-console-api.csdn.net";
  private cookies: CsdnCookies;
  private cookieHeader: string;
  private xCaKey = "203803574"; // 固定的 API Key

  constructor(cookiesJson: string) {
    this.cookies = this.parseCookies(cookiesJson);
    this.cookieHeader = this.buildCookieHeader();
    log("初始化完成, UserName:", this.cookies.UserName);
  }

  /**
   * 解析 cookies JSON 字符串
   */
  private parseCookies(cookiesJson: string): CsdnCookies {
    try {
      const cookiesArray = JSON.parse(cookiesJson);
      const cookies: CsdnCookies = {
        UserToken: "",
        UserName: "",
      };

      for (const cookie of cookiesArray) {
        if (cookie.name && cookie.value) {
          cookies[cookie.name] = cookie.value;
        }
      }

      return cookies;
    } catch {
      throw new Error("无效的 cookies 格式");
    }
  }

  /**
   * 构建 cookie 字符串用于请求头
   */
  private buildCookieHeader(): string {
    return Object.entries(this.cookies)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  /**
   * 生成 UUID
   */
  private generateUuid(): string {
    return crypto.randomUUID();
  }

  /**
   * 生成 CSDN API 签名
   * 基于阿里云 API 网关签名规范
   * 
   * 签名串格式:
   * HTTPMethod\n
   * Accept\n
   * Content-MD5 (始终为空)\n
   * Content-Type\n
   * Date\n
   * Headers (x-ca-key:xxx\nx-ca-nonce:xxx)\n
   * PathAndParameters
   * 
   * 参考: CSDN 前端 csdn-http.js 签名实现
   */
  private generateSignature(
    method: string,
    path: string,
    nonce: string,
    accept: string,
    contentType: string
  ): { signature: string; signatureHeaders: string } {
    // 需要参与签名的自定义 header keys（按字典序排序）
    const signHeaderKeys = ["x-ca-key", "x-ca-nonce"];
    
    // 构建 Headers 签名部分（key:value 格式，按字典序）
    // 注意：header key 需要小写
    const headersMap: Record<string, string> = {
      "x-ca-key": this.xCaKey,
      "x-ca-nonce": nonce,
    };
    
    // Headers 部分按字典序排列，每个 header 占一行
    const headersString = signHeaderKeys
      .sort()
      .map((key) => `${key}:${headersMap[key]}`)
      .join("\n");

    // 解析 URL 中的查询参数
    let urlPath = path;
    let queryParams: Record<string, string> = {};
    
    if (path.includes("?")) {
      const [basePath, queryString] = path.split("?");
      urlPath = basePath;
      
      // 解析查询参数
      const params = new URLSearchParams(queryString);
      params.forEach((value, key) => {
        queryParams[key] = value;
      });
    }
    
    // 构建 URL + 排序后的参数
    const sortedParamKeys = Object.keys(queryParams).sort();
    let pathWithParams = urlPath;
    if (sortedParamKeys.length > 0) {
      const paramString = sortedParamKeys
        .map((key) => {
          const value = queryParams[key];
          return value !== undefined && value !== "" 
            ? `${key}=${value}` 
            : key;
        })
        .join("&");
      pathWithParams = `${urlPath}?${paramString}`;
    }

    // 构建签名串
    // 关键点：Content-MD5 始终为空字符串，这是 CSDN 实现的特殊之处
    const stringToSign = [
      method,           // HTTPMethod
      accept,           // Accept
      "",               // Content-MD5 (CSDN 始终为空)
      contentType,      // Content-Type
      "",               // Date (空)
      headersString,    // Headers (x-ca-key:xxx\nx-ca-nonce:xxx)
      pathWithParams,   // Path + 排序后的参数
    ].join("\n");

    log("签名串:", JSON.stringify(stringToSign));

    // CSDN 使用的 appSecret（通过分析前端 JS 获取）
    const appSecret = "9znpamsyl2c7cdrr9sas0le9vbc3r6ba";
    
    const signature = crypto
      .createHmac("sha256", appSecret)
      .update(stringToSign, "utf8")
      .digest("base64");

    log("生成签名:", signature);

    return {
      signature,
      signatureHeaders: signHeaderKeys.sort().join(","),
    };
  }

  /**
   * 发送 API 请求
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: object
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const nonce = this.generateUuid();
    const bodyString = body ? JSON.stringify(body) : "";
    
    const accept = "application/json, text/plain, */*";
    const contentType = body ? "application/json;charset=UTF-8" : "";

    // 计算签名（CSDN 签名中不使用 Content-MD5）
    const { signature, signatureHeaders } = this.generateSignature(
      method,
      path,
      nonce,
      accept,
      contentType
    );

    log("发送请求:", { method, url });
    if (body) {
      log("请求体:", JSON.stringify(body).substring(0, 500));
    }

    const headers: Record<string, string> = {
      Accept: accept,
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Cookie: this.cookieHeader,
      Origin: "https://editor.csdn.net",
      Referer: "https://editor.csdn.net/md/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "X-Ca-Key": this.xCaKey,
      "X-Ca-Nonce": nonce,
      "X-Ca-Signature": signature,
      "X-Ca-Signature-Headers": signatureHeaders,
    };

    // 只在有 body 时添加 Content-Type
    if (body) {
      headers["Content-Type"] = contentType;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: bodyString || undefined,
    });

    const text = await response.text();

    // 如果签名失败，打印服务器返回的签名串以便调试
    const errorMessage = response.headers.get("x-ca-error-message");
    if (errorMessage) {
      log("服务器签名错误信息:", errorMessage);
      // 解析服务器返回的签名串（# 替换为 \n）
      const serverStringToSign = errorMessage.replace(/`/g, "").replace(/#/g, "\n");
      log("服务器期望的签名串:", JSON.stringify(serverStringToSign));
    }

    let result: { code: number; msg?: string; message?: string; data: T; traceId?: string };
    try {
      result = JSON.parse(text);
    } catch {
      log("请求失败（非JSON响应）:", {
        status: response.status,
        body: text.substring(0, 500),
      });
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    log("响应:", result);

    if (result.code !== 200) {
      throw new Error(`${result.msg || result.message || "请求失败"} (code: ${result.code})`);
    }

    return result.data;
  }

  /**
   * 发送旧版 API 请求（不需要签名，使用 Cookie 认证）
   * 用于一些不需要签名验证的接口
   */
  private async legacyRequest<T>(
    method: "GET" | "POST",
    path: string,
    body?: object
  ): Promise<T> {
    const url = `${this.legacyBaseUrl}${path}`;
    const bodyString = body ? JSON.stringify(body) : "";

    log("发送旧版请求:", { method, url });
    if (body) {
      log("请求体:", JSON.stringify(body).substring(0, 500));
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Cookie: this.cookieHeader,
      Origin: "https://editor.csdn.net",
      Referer: "https://editor.csdn.net/md/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: bodyString || undefined,
    });

    const text = await response.text();

    let result: { code: number; msg?: string; message?: string; data: T };
    try {
      result = JSON.parse(text);
    } catch {
      log("请求失败（非JSON响应）:", {
        status: response.status,
        body: text.substring(0, 500),
      });
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    log("响应:", result);

    if (result.code !== 200) {
      throw new Error(`${result.msg || result.message || "请求失败"} (code: ${result.code})`);
    }

    return result.data;
  }

  // ==================== 用户相关 API ====================

  /**
   * 获取当前用户信息
   */
  async getUserInfo(): Promise<CsdnUserInfo | null> {
    try {
      // CSDN 用户信息从 cookies 中获取
      return {
        userName: this.cookies.UserName,
        nickName: this.cookies.UserName,
      };
    } catch (error) {
      log("获取用户信息失败:", error);
      return null;
    }
  }

  /**
   * 验证登录状态
   */
  async checkLoginStatus(): Promise<boolean> {
    try {
      // 简单检查是否有必要的 cookies
      return !!this.cookies.UserToken && !!this.cookies.UserName;
    } catch {
      return false;
    }
  }

  // ==================== 标签相关 API ====================

  /**
   * 获取推荐标签
   */
  async getRecommendTags(title: string, content: string): Promise<CsdnTagInfo[]> {
    try {
      const result = await this.request<{
        common: string[];
        list: Record<string, string[]>;
        images: string[];
      }>("POST", "/blog/phoenix/console/v1/tag/get-recommend-tags", {
        title,
        content,
        type: 2, // markdown 类型
      });

      // 返回推荐的标签
      const tags: CsdnTagInfo[] = [];
      
      // 添加通用推荐标签
      if (result.common) {
        result.common.forEach((name) => tags.push({ name }));
      }

      // 添加分类标签（取前 20 个）
      if (result.list) {
        Object.values(result.list).flat().slice(0, 20).forEach((name) => {
          if (!tags.find((t) => t.name === name)) {
            tags.push({ name });
          }
        });
      }

      return tags;
    } catch (error) {
      log("获取推荐标签失败:", error);
      return [];
    }
  }

  /**
   * 搜索标签（实时搜索）
   * 使用 API: POST /blog/phoenix/console/v1/tag/search-recommend-tag
   * 请求体: {"key":"关键词","page":0,"page_size":1000,"platform":"pc"}
   */
  async searchTags(keyword: string): Promise<CsdnTagInfo[]> {
    try {
      if (!keyword || keyword.trim().length === 0) {
        return [];
      }

      const result = await this.request<string[]>(
        "POST",
        "/blog/phoenix/console/v1/tag/search-recommend-tag",
        {
          key: keyword.trim(),
          page: 0,
          page_size: 1000,
          platform: "pc",
        }
      );

      // API 返回的是字符串数组，转换为 CsdnTagInfo 格式
      return (result || []).map((name) => ({ name }));
    } catch (error) {
      log("搜索标签失败:", error);
      return [];
    }
  }

  // ==================== 文章相关 API ====================

  /**
   * 获取用户文章列表
   * API: GET /blog/phoenix/console/v1/article/list
   * 
   * @param status - 文章状态:
   *   - all_v3: 全部文章（已发布+草稿）
   *   - all_v2: 已发布文章
   *   - draft: 草稿箱
   *   - audit: 审核中
   *   - deleted: 回收站
   * @param pageSize - 每页数量
   * @param page - 页码
   */
  async fetchUserArticles(params: {
    status?: "all_v3" | "all_v2" | "draft" | "audit" | "deleted";
    pageSize?: number;
    page?: number;
  } = {}): Promise<Array<{
    articleId: string;
    title: string;
    status: string; // "1"-已发布, "2"-草稿
    postTime: string;
    viewCount: string;
    commentCount: string;
    diggCount: number;
    collectCount: number;
  }>> {
    const { status = "all_v3", pageSize = 20, page = 1 } = params;
    
    const path = `/blog/phoenix/console/v1/article/list?status=${status}&pageSize=${pageSize}&page=${page}`;
    
    const result = await this.request<{
      list: Array<{
        articleId: string;
        title: string;
        status: string;
        postTime: string;
        viewCount: string;
        commentCount: string;
        diggCount: number;
        collectCount: number;
      }>;
      total: number;
      page: number;
      size: number;
    }>("GET", path);

    return result.list || [];
  }

  /**
   * 获取用户草稿列表
   */
  async fetchUserDrafts(params: {
    pageSize?: number;
    page?: number;
  } = {}): Promise<Array<{
    articleId: string;
    title: string;
    status: string;
    postTime: string;
  }>> {
    return this.fetchUserArticles({
      ...params,
      status: "draft",
    });
  }

  /**
   * 保存文章（草稿或发布）
   */
  async saveArticle(params: SaveArticleParams): Promise<SaveArticleResponse> {
    const {
      articleId,
      title,
      markdownContent,
      htmlContent,
      tags = [],
      description = "",
      coverImages = [],
      type = "original",
      readType = "public",
      pubStatus = "draft",
    } = params;

    // 构建请求体
    const requestBody: Record<string, unknown> = {
      title,
      markdowncontent: markdownContent,
      content: htmlContent,
      readType,
      level: 0,
      tags: tags.join(","),
      status: pubStatus === "publish" ? 0 : 2, // 0-发布, 2-草稿
      categories: "",
      type: type, // original, repost, translated
      original_link: "",
      authorized_status: false,
      Description: description,
      not_auto_saved: "1",
      source: "pc_mdeditor",
      cover_images: coverImages,
      cover_type: coverImages.length > 0 ? 1 : 0,
      is_new: articleId ? 0 : 1,
      vote_id: 0,
      resource_id: "",
      pubStatus: pubStatus,
      creator_activity_id: "",
    };

    // 如果是更新文章，添加文章 ID
    if (articleId) {
      requestBody.id = articleId;
    }

    const result = await this.request<SaveArticleResponse>(
      "POST",
      "/blog-console-api/v3/mdeditor/saveArticle",
      requestBody
    );

    return result;
  }

  /**
   * 发布文章（一键发布）
   */
  async publishArticle(params: Omit<SaveArticleParams, "pubStatus">): Promise<SaveArticleResponse> {
    return this.saveArticle({
      ...params,
      pubStatus: "publish",
    });
  }

  /**
   * 保存为草稿
   */
  async saveDraft(params: Omit<SaveArticleParams, "pubStatus">): Promise<SaveArticleResponse> {
    return this.saveArticle({
      ...params,
      pubStatus: "draft",
    });
  }

  // ==================== 图片上传 API ====================

  /**
   * 获取图片上传签名
   * API: POST https://bizapi.csdn.net/resource-api/v1/image/direct/upload/signature
   */
  private async getUploadSignature(imageSuffix: string): Promise<{
    accessId: string;
    policy: string;
    signature: string;
    host: string;
    filePath: string;
    callbackUrl: string;
    callbackBody: string;
    callbackBodyType: string;
    customParam: {
      rtype: string;
      filePath: string;
      isAudit: number;
      "x-image-app": string;
      type: string;
      "x-image-suffix": string;
      username: string;
    };
  }> {
    const path = "/resource-api/v1/image/direct/upload/signature";
    const nonce = this.generateUuid();
    // 重要：时间戳需要精确到秒（末尾为000），这是 CSDN API 的要求
    const timestamp = (Math.floor(Date.now() / 1000) * 1000).toString();

    const accept = "application/json, text/plain, */*";
    const contentType = "application/json;charset=UTF-8";

    // 使用新的 x-ca-key 用于图片上传 API（与编辑器一致）
    const imageApiKey = "260196572";

    // 生成签名（针对图片上传 API）
    const { signature, signatureHeaders } = this.generateSignatureForImageApi(
      "POST",
      path,
      nonce,
      timestamp,
      accept,
      contentType,
      imageApiKey
    );

    const requestBody = {
      imageTemplate: "",
      appName: "direct_blog_markdown",
      imageSuffix: imageSuffix,
    };

    log("获取上传签名, 请求体:", requestBody);

    const response = await fetch(`https://bizapi.csdn.net${path}`, {
      method: "POST",
      headers: {
        Accept: accept,
        "Content-Type": contentType,
        Cookie: this.cookieHeader,
        Origin: "https://editor.csdn.net",
        Referer: "https://editor.csdn.net/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        "x-ca-key": imageApiKey,
        "x-ca-nonce": nonce,
        "x-ca-timestamp": timestamp,
        "x-ca-signature": signature,
        "x-ca-signature-headers": signatureHeaders,
      },
      body: JSON.stringify(requestBody),
    });

    const text = await response.text();
    log("获取上传签名响应状态:", response.status);
    
    // 检查签名错误
    const errorMessage = response.headers.get("x-ca-error-message");
    if (errorMessage) {
      log("服务器签名错误信息:", errorMessage);
    }

    let result: {
      code: number;
      msg: string;
      data: {
        accessId: string;
        policy: string;
        signature: string;
        host: string;
        filePath: string;
        callbackUrl: string;
        callbackBody: string;
        callbackBodyType: string;
        customParam: {
          rtype: string;
          filePath: string;
          isAudit: number;
          "x-image-app": string;
          type: string;
          "x-image-suffix": string;
          username: string;
        };
      };
    };

    try {
      result = JSON.parse(text);
    } catch {
      log("获取上传签名响应解析失败:", text.substring(0, 500));
      throw new Error(`获取上传签名失败: 响应解析错误`);
    }

    log("获取上传签名响应:", result);

    if (result.code !== 200) {
      throw new Error(result.msg || "获取上传签名失败");
    }

    log("获取上传签名成功:", result.data.filePath);
    return result.data;
  }

  /**
   * 生成图片上传 API 的签名
   * 图片上传 API 使用不同的 key 和签名方式
   * 
   * 注意: x-ca-key: 260196572 对应的 appSecret 与 203803574 不同
   * 通过分析 CSDN 编辑器 JS (app.chunk.*.js) 获取
   */
  private generateSignatureForImageApi(
    method: string,
    path: string,
    nonce: string,
    timestamp: string,
    accept: string,
    contentType: string,
    xCaKey: string
  ): { signature: string; signatureHeaders: string } {
    // 需要参与签名的自定义 header keys（按字典序排序）
    const signHeaderKeys = ["x-ca-key", "x-ca-nonce", "x-ca-timestamp"];

    // 构建 Headers 签名部分
    const headersMap: Record<string, string> = {
      "x-ca-key": xCaKey,
      "x-ca-nonce": nonce,
      "x-ca-timestamp": timestamp,
    };

    const headersString = signHeaderKeys
      .sort()
      .map((key) => `${key}:${headersMap[key]}`)
      .join("\n");

    // 构建签名串
    const stringToSign = [
      method,
      accept,
      "",
      contentType,
      "",
      headersString,
      path,
    ].join("\n");

    log("图片API签名串:", JSON.stringify(stringToSign));

    // x-ca-key: 260196572 对应的 appSecret
    // 来源: CSDN csdn-upload.js (https://g.csdnimg.cn/csdn-upload/1.0.9/csdn-upload.js)
    const appSecret = "t5PaqxVQpWoHgLGt7XPIvd5ipJcwJTU7";

    const signature = crypto
      .createHmac("sha256", appSecret)
      .update(stringToSign, "utf8")
      .digest("base64");

    log("图片API生成签名:", signature);

    return {
      signature,
      signatureHeaders: signHeaderKeys.sort().join(","),
    };
  }

  /**
   * 上传图片到华为云 OBS
   * 使用从签名接口获取的凭证上传
   */
  private async uploadToObs(
    imageBuffer: Buffer,
    signatureData: Awaited<ReturnType<typeof this.getUploadSignature>>
  ): Promise<string> {
    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString("hex")}`;

    // 构建 multipart/form-data 的各个部分
    const parts: Array<{ name: string; value: string }> = [
      { name: "key", value: signatureData.filePath },
      { name: "policy", value: signatureData.policy },
      { name: "signature", value: signatureData.signature },
      { name: "callbackBody", value: signatureData.callbackBody },
      { name: "callbackBodyType", value: signatureData.callbackBodyType },
      { name: "callbackUrl", value: signatureData.callbackUrl },
      { name: "AccessKeyId", value: signatureData.accessId },
      { name: "x:rtype", value: signatureData.customParam.rtype },
      { name: "x:filePath", value: signatureData.customParam.filePath },
      { name: "x:isAudit", value: String(signatureData.customParam.isAudit) },
      { name: "x:x-image-app", value: signatureData.customParam["x-image-app"] },
      { name: "x:type", value: signatureData.customParam.type },
      { name: "x:x-image-suffix", value: signatureData.customParam["x-image-suffix"] },
      { name: "x:username", value: signatureData.customParam.username },
    ];

    // 构建请求体
    let body = "";
    for (const part of parts) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`;
      body += `${part.value}\r\n`;
    }

    // 添加文件部分
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="image.${signatureData.customParam["x-image-suffix"]}"\r\n`;
    body += `Content-Type: image/${signatureData.customParam["x-image-suffix"]}\r\n\r\n`;

    // 将文本部分和二进制部分合并
    const textEncoder = new TextEncoder();
    const bodyStart = textEncoder.encode(body);
    const bodyEnd = textEncoder.encode(`\r\n--${boundary}--\r\n`);

    const fullBody = new Uint8Array(bodyStart.length + imageBuffer.length + bodyEnd.length);
    fullBody.set(bodyStart, 0);
    fullBody.set(new Uint8Array(imageBuffer), bodyStart.length);
    fullBody.set(bodyEnd, bodyStart.length + imageBuffer.length);

    log("上传到 OBS:", signatureData.host);

    const response = await fetch(`${signatureData.host}/`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Origin: "https://editor.csdn.net",
        Referer: "https://editor.csdn.net/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      },
      body: fullBody,
    });

    const result = await response.json() as {
      code: number;
      msg: string;
      data?: {
        hostname: string;
        imageUrl: string;
        width: string;
        height: string;
        targetObjectKey: string;
        "x-image-suffix": string;
      };
    };

    if (result.code !== 200 || !result.data?.imageUrl) {
      throw new Error(result.msg || "图片上传到 OBS 失败");
    }

    log("OBS 上传成功:", result.data.imageUrl);
    return result.data.imageUrl;
  }

  /**
   * 上传图片到 CSDN（使用华为云 OBS）
   * 两步上传流程：
   * 1. 获取上传签名
   * 2. 上传到华为云 OBS
   * 
   * @param imageBuffer 图片二进制数据
   * @param extension 图片扩展名（如 png, jpg）
   * @returns 图片访问 URL
   */
  async uploadImage(imageBuffer: Buffer, extension: string): Promise<string> {
    log(`开始上传图片，大小: ${imageBuffer.length} bytes, 扩展名: ${extension}`);

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 第一步：获取上传签名
        const signatureData = await this.getUploadSignature(extension);

        // 第二步：上传到 OBS
        const imageUrl = await this.uploadToObs(imageBuffer, signatureData);

        log("图片上传成功:", imageUrl);
        return imageUrl;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log(`图片上传失败 (尝试 ${attempt}/${maxRetries}):`, lastError.message);

        if (attempt < maxRetries) {
          // 等待后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error("图片上传失败");
  }

  /**
   * 将 Markdown 转换为 HTML（使用 CSDN 的转换逻辑）
   * 注意：这里使用简单的转换，实际 CSDN 编辑器会在前端完成转换
   */
  markdownToHtml(markdown: string): string {
    // 简单的 markdown 到 html 转换
    // CSDN 编辑器会使用 Prism 进行代码高亮
    let html = markdown;

    // 转换标题
    html = html.replace(/^######\s+(.+)$/gm, '<h6><a id="$1"></a>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5><a id="$1"></a>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4><a id="$1"></a>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3><a id="$1"></a>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2><a id="$1"></a>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1><a id="$1"></a>$1</h1>');

    // 转换代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || "";
      const escapedCode = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<pre><code class="prism language-${language}">${escapedCode}</code></pre>`;
    });

    // 转换行内代码
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // 转换粗体
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // 转换斜体
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // 转换无序列表
    html = html.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

    // 转换有序列表
    html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

    // 转换链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 转换图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

    // 转换引用
    html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");

    // 转换段落
    html = html.replace(/^(?!<[hupol]|<blockquote|<pre|<li)(.+)$/gm, "<p>$1</p>");

    // 清理多余的空行
    html = html.replace(/\n{3,}/g, "\n\n");

    return html;
  }
}

// ==================== 风险检查 API ====================

/**
 * 微信验证二维码 URL 生成
 * 用于构建微信扫码验证的二维码链接
 */
export interface WechatVerifyInfo {
  /** 是否需要微信验证 */
  needVerify: boolean;
  /** 微信验证二维码 URL */
  qrCodeUrl?: string;
  /** 验证时间戳（用于构建 URL） */
  timestamp?: number;
}

/**
 * 风险检查响应
 */
export interface RiskCheckResponse {
  code: string;
  code_error?: number;
  message: string;
  status: boolean;
}

/**
 * CSDN 风险检查 API
 * 当发布文章时，可能需要进行微信扫码验证
 * 
 * 流程：
 * 1. 调用 checkRisk() 检查是否需要验证
 * 2. 如果需要验证，会返回 code_error 时间戳
 * 3. 使用该时间戳构建微信二维码 URL
 * 4. 用户扫码验证后，重新发布文章
 */
export class CsdnRiskChecker {
  private cookies: CsdnCookies;
  private cookieHeader: string;

  constructor(cookiesJson: string) {
    this.cookies = JSON.parse(cookiesJson).reduce((acc: CsdnCookies, cookie: { name: string; value: string }) => {
      if (cookie.name && cookie.value) {
        acc[cookie.name] = cookie.value;
      }
      return acc;
    }, { UserToken: "", UserName: "" });
    this.cookieHeader = Object.entries(this.cookies)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  /**
   * 获取用户名
   */
  getUsername(): string {
    return this.cookies.UserName;
  }

  /**
   * 检查风险状态
   * API: POST https://passport.csdn.net/v1/api/user/risk/check
   * 
   * @returns 风险检查结果，如果需要验证返回 qrCodeUrl
   */
  async checkRisk(): Promise<WechatVerifyInfo> {
    const url = "https://passport.csdn.net/v1/api/user/risk/check";
    
    const requestBody = {
      username: this.cookies.UserName,
      biz: "blog",
      subBiz: "article",
    };

    log("风险检查请求:", requestBody);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Accept: "application/json, text/plain, */*",
          Cookie: this.cookieHeader,
          Origin: "https://editor.csdn.net",
          Referer: "https://editor.csdn.net/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        },
        body: JSON.stringify(requestBody),
      });

      const result: RiskCheckResponse = await response.json();
      log("风险检查响应:", result);

      // code: "1239" 表示需要微信验证
      if (result.code === "1239" && result.code_error) {
        const timestamp = result.code_error;
        const qrCodeUrl = this.buildWechatQrCodeUrl(timestamp);
        
        log("需要微信验证, 二维码 URL:", qrCodeUrl);
        
        return {
          needVerify: true,
          qrCodeUrl,
          timestamp,
        };
      }

      // code: "200" 或 status: true 表示不需要验证
      return {
        needVerify: false,
      };
    } catch (error) {
      log("风险检查失败:", error);
      // 出错时假设不需要验证，让发布流程继续
      return {
        needVerify: false,
      };
    }
  }

  /**
   * 构建微信扫码验证二维码 URL
   * 
   * @param timestamp - 从 checkRisk 返回的 code_error 时间戳
   * @returns 微信扫码二维码 URL
   */
  private buildWechatQrCodeUrl(timestamp: number): string {
    const redirectUri = encodeURIComponent(
      `https://passport.csdn.net/v1/service/thirdCheck/checkThirdAccount?thirdAccountType=weixin&u=${timestamp}`
    );
    
    return `https://open.weixin.qq.com/connect/qrconnect?appid=wx0ae11b6a28b4b9fc&scope=snsapi_login&redirect_uri=${redirectUri}&state=csdn&login_type=jssdk&self_redirect=true`;
  }
}

/**
 * 创建风险检查器
 */
export function createCsdnRiskChecker(cookiesJson: string): CsdnRiskChecker {
  return new CsdnRiskChecker(cookiesJson);
}

/**
 * 创建 CSDN API 客户端
 */
export function createCsdnApiClient(cookiesJson: string): CsdnApiClient {
  return new CsdnApiClient(cookiesJson);
}
