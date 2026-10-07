export interface Env {
  TEAMS_HMAC_SECRET: string;
  NOTION_TOKEN: string;
  NOTION_DATABASE_ID: string;
  DEBUG?: string;
}

export type IssueType = "버그" | "개선" | "기타";

export interface Issue {
  title: string;
  type: IssueType;
  body: string;
  author: string;
  sourceUrl: string | null;
}

/** Teams Outgoing Webhook payload 중 사용하는 필드만 정의 */
export interface TeamsPayload {
  type?: string;
  id?: string;
  text?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { id?: string; tenantId?: string; conversationType?: string };
  channelData?: { tenant?: { id?: string }; teamsChannelId?: string };
}
