export interface Env {
  FORM_PASSWORD: string;
  NOTION_TOKEN: string;
  NOTION_DATABASE_ID: string;
  /** Redmine 일감 주소 접두어 (예: http://redmine.example.com/issues/). "#11661" → 일감 링크 변환에 사용 */
  REDMINE_ISSUE_URL?: string;
  /** 이미 처리한 Teams 메시지 지문 (KV). 없으면 "처리한 메시지 제외" 기능을 쓰지 않는다 */
  PROCESSED_MESSAGES?: KeyValueStore;
}

/** 쓰는 KV 기능만 (Workers의 KVNamespace와 호환. scripts/의 Node 타입 검사에서도 쓸 수 있게 직접 정의) */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export const ISSUE_TYPES = ["버그", "개선", "운영", "기타"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const PLATFORMS = ["FO", "BO"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface Issue {
  title: string;
  type: IssueType;
  body: string;
  /** 작성자 이름 (Notion select 옵션) */
  author: string;
  /** FO(프론트 오피스) / BO(백오피스) */
  platform: Platform | null;
  /** 일감 (Redmine) */
  workItemUrl: string | null;
  /** MR (GitLab merge request) */
  mrUrl: string | null;
  /** 브랜치 (쉼표로 구분) */
  branch: string;
  /** 관련 파일 (쉼표로 구분, "경로:줄") */
  files: string;
  /** 영역 (모듈) */
  areas: string[];
}
