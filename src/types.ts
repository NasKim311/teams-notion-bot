export interface Env {
  FORM_PASSWORD: string;
  NOTION_TOKEN: string;
  NOTION_DATABASE_ID: string;
}

export const ISSUE_TYPES = ["버그", "개선", "운영", "기타"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export interface Issue {
  title: string;
  type: IssueType;
  body: string;
  author: string;
  sourceUrl: string | null;
}
